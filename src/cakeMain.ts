'use strict';

import * as vscode from 'vscode';
import { installCakeBootstrapper } from './bootstrapper/cakeBootstrapperCommand';
import { installCakeConfiguration } from './configuration/cakeConfigurationCommand';
import * as fs from 'fs';
import * as os from 'os';

type AutoDetect = 'on' | 'off';
let taskProvider: vscode.Disposable | undefined;

export function activate(context: vscode.ExtensionContext): void {
    // Register the bootstrapper command.
    context.subscriptions.push(vscode.commands.registerCommand('cake.bootstrapper', async () => {
        installCakeBootstrapper();
    }));
    // Register the configuration command.
    context.subscriptions.push(vscode.commands.registerCommand('cake.configuration', async () => {
        installCakeConfiguration();
    }));

    function onConfigurationChanged() {
        let autoDetect = vscode.workspace.getConfiguration('npm').get<AutoDetect>('autoDetect');
		if (taskProvider  && autoDetect === 'off') {
            taskProvider.dispose();
            taskProvider = undefined;
        } else if (!taskProvider && autoDetect === 'on') {
            taskProvider = vscode.workspace.registerTaskProvider('cake', {
                provideTasks: async () => {
                    return await getCakeScriptsAsTasks();
                },
                resolveTask(_task: vscode.Task): vscode.Task | undefined {
                    return undefined;
                }
            });
        }
    }

    vscode.workspace.onDidChangeConfiguration(onConfigurationChanged);
    onConfigurationChanged();
}

export function deactivate() {
    if (taskProvider) {
        taskProvider.dispose();
    }
}

interface CakeTaskDefinition extends vscode.TaskDefinition {
    script: string;
    file?: string;
}

async function getCakeScriptsAsTasks(): Promise<vscode.Task[]> {
    let workspaceRoot = vscode.workspace.rootPath;
    let emptyTasks: vscode.Task[] = [];

    if (!workspaceRoot) {
        return emptyTasks;
    }

    try {
        let files = await vscode.workspace.findFiles('**/*.cake', 'tools');
        if (files.length === 0) {
            return emptyTasks;
        }
        const result: vscode.Task[] = [];

        files.forEach(file => {
            const contents = fs.readFileSync(file.fsPath).toString();

            let taskRegularExpression = /Task\("(.*?)"\)/g;

            let matches, taskNames = [];
            while (matches = taskRegularExpression.exec(contents)) {
                taskNames.push(matches[1]);
            }

            taskNames.forEach(taskName => {
                const kind: CakeTaskDefinition = {
                    type: 'cake',
                    script: taskName
                };

                let buildCommand = `./build.sh --target \"${taskName}\"`;
                if (os.platform() === "win32") {
                    buildCommand = `powershell -ExecutionPolicy ByPass -File build.ps1 -target \"${taskName}\"`;
                }

                const buildTask = new vscode.Task(kind, `Run ${taskName}`, 'Cake', new vscode.ShellExecution(`${buildCommand}`));
                buildTask.group = vscode.TaskGroup.Build;

                result.push(buildTask);
            });
        });

        return result;
    } catch (e) {
        return [];
    }
};