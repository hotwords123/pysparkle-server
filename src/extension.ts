// The module 'vscode' contains the VS Code extensibility API
// Import the module and reference it with the alias vscode in your code below
import * as vscode from 'vscode';

import {
  LanguageClient,
  LanguageClientOptions,
  ServerOptions,
  State,
} from 'vscode-languageclient/node';

let client: LanguageClient | null = null;
let clientStarting = false;
let clientStopping = false;
let logger: vscode.LogOutputChannel;

export function activate(context: vscode.ExtensionContext) {
  logger = vscode.window.createOutputChannel('PySparkle', { log: true });
  logger.info('Extension activated.');

  context.subscriptions.push(
    // Register commands.
    vscode.commands.registerCommand('pysparkle.server.restart', async () => {
      logger.info('Restarting server...');
      await restartServer();
    }),

    // Restart the server when the configuration changes.
    vscode.workspace.onDidChangeConfiguration(async event => {
      if (event.affectsConfiguration('pysparkle.server')) {
        logger.info('Configuration changed, restarting server...');
        await restartServer();
      }
    }),

    // Start the server when a Python file is opened.
    vscode.workspace.onDidOpenTextDocument(async document => {
      logger.info('Document opened:', document.uri, document.languageId);
      if (document.languageId === 'python') {
        await startServer();
      }
    }),
  );

  // Start the server if a Python file is already open.
  for (const document of vscode.workspace.textDocuments) {
    if (document.languageId === 'python') {
      startServer();
      break;
    }
  }

  vscode.window.showInformationMessage('PySparkle is now active.');
}

// This method is called when your extension is deactivated
export async function deactivate() {
  await stopServer();
}

async function startServer() {
  if (client || clientStarting) {
    return;
  }

  clientStarting = true;
  try {
    const config = vscode.workspace.getConfiguration('pysparkle.server');

    let cwd = config.get<string>('cwd');
    if (!cwd) {
      throw new Error('No working directory specified for the server.');
    }

    // Replace ${workspaceFolder} with the first workspace folder.
    const match = cwd.match(/\$\{workspaceFolder\}/);
    if (match) {
      const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
      if (!workspaceFolder) {
        throw new Error('No workspace folder found.');
      }
      cwd = cwd.replace(match[0], workspaceFolder.uri.fsPath);
    }

    const pythonPath = config.get<string>('pythonPath');
    if (!pythonPath) {
      throw new Error('No Python interpreter specified for the server.');
    }

    const launchScript = config.get<string>('launchScript');
    if (!launchScript) {
      throw new Error('No launch script specified for the server.');
    }

    const launchArgs = config.get<string[]>('launchArgs') ?? [];

    const serverOptions: ServerOptions = {
      command: pythonPath,
      args: [launchScript, ...launchArgs],
      options: { cwd },
    };

    const clientOptions: LanguageClientOptions = {
      documentSelector: [{ scheme: 'file', language: 'python' }],
      outputChannel: logger,
      connectionOptions: {
        maxRestartCount: 0,
      },
    };

    logger.info('Server options:', serverOptions);
    logger.info('Client options:', clientOptions);

    client = new LanguageClient(
      'pysparkle',
      'PySparkle Language Server',
      serverOptions,
      clientOptions,
    );

    await client.start();
  } catch (error) {
    logger.error('Failed to start server:', error);
    vscode.window.showErrorMessage('Failed to start PySparkle server.');
    logger.show();
  } finally {
    clientStarting = false;
  }
}

async function stopServer() {
  if (!client || clientStopping) {
    return;
  }

  clientStopping = true;
  try {
    if (client.state === State.Running) {
      await client.stop();
    }

    client.dispose();
  } catch (error) {
    logger.error('Failed to stop server:', error);
    vscode.window.showErrorMessage('Failed to stop PySparkle server.');
    logger.show();
  } finally {
    clientStopping = false;
    client = null;
  }
}

async function restartServer() {
  await stopServer();
  await startServer();
}
