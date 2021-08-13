// The module 'vscode' contains the VS Code extensibility API
// Import the module and reference it with the alias vscode in your code below
const vscode = require('vscode');

// this method is called when your extension is activated
// your extension is activated the very first time the command is executed

var editor = vscode.window.activeTextEditor;
var doc = editor.document;

/**
 * @param {vscode.ExtensionContext} context
 */
function activate(context) {
	vscode.window.onDidChangeActiveTextEditor(() => {
		editor = vscode.window.activeTextEditor;
		doc = editor.document;
	});

	vscode.window.onDidChangeVisibleTextEditors(() => {
		editor = vscode.window.activeTextEditor;
		doc = editor.document;
	});
	// Use the console to output diagnostic information (console.log) and errors (console.error)
	// This line of code will only be executed once when your extension is activated


	// The command has been defined in the package.json file
	// Now provide the implementation of the command with registerCommand
	// The commandId parameter must match the command field in package.json
	let disposable = vscode.commands.registerCommand('php-implement.helloWorld', async function () {
		// The code you place here will be executed every time your command is executed
		// Display a message box to the user
		var offset = doc.getText().indexOf("{");
		var pos = doc.positionAt(offset + 1);

		insertSnippet(pos);
	});

	context.subscriptions.push(disposable);
}

async function insertSnippet(pos) {
	var text = "";
	var parents = getAllParents(doc.getText()).then(parents => {
		parents.forEach(parent => {
			parent.methods.forEach(method => {
				text += "\n\t" + method.declaration + "\n\t{\n\t\t//Implementation\n\t}\n\t";
			});
		});
		editor.insertSnippet(new vscode.SnippetString(text.replaceAll('$', '\\$')), pos);

		vscode.window.showInformationMessage('Implemented ' + parents.length + ' methods!');
	});

	return;
}

function getNamespaceOfCurrentFile() {
	var text = doc.getText();

	var nI = text.indexOf('namespace');
	var namespace = text.substring(nI+9, text.indexOf(";", nI)).trim();

	return namespace;
}

async function getAllParents(text, result = []) {
	var eI = text.indexOf('extends');

	if (eI === -1)
		return result;

	var className = text.substring(eI+7, text.indexOf('implements') !== -1 ? text.indexOf('implements') : text.indexOf("{", eI)).trim();
	var matches = text.match(new RegExp(`use.*${className};`));

	var match;
	if (!matches)
		match = getNamespaceOfCurrentFile() + "\\" + className;
	else 
		match = matches[0].replace('use', '').replace(';', '').trim();

	var parentText = await getFileText(match);
	await getAllParents(parentText, result);
	
	result.push({
		parent: match,
		methods: getAbstractMethods(parentText)
	});

	var implementedMethods = getImplementedMethods(text);

	result.forEach((parent, resultIndex) => {
		result[resultIndex].methods = parent.methods.filter((method) => {
			return implementedMethods.find(val => method.methodName == val.methodName) === undefined;
		});
	});

	result = result.filter(parent => parent.methods.length > 0);

	return result;
}

function getImplementedMethods(text) {
	var methods = [];
	var matches = text.matchAll(/(?<=\s)(((public)|(static)|(protected)|(private)|(final))\s+)*function[^\n;]*\([^\)]*\)[^{]*(?={)/gs);
	Array.from(matches).forEach((val) => {
		var func = val[0];
		methods.push({
			declaration: func.replace('{', '').trim(),
			methodName: func.substring(func.indexOf('function') + 8, func.indexOf('(')).trim()
		});
	});

	return methods;
}

function getAbstractMethods(text) {	
	var methods = [];
	var matches = text.matchAll(/(?<=\s)(((public)|(static)|(protected)|(private))\s+)*abstract[^\n;]*function[^\n;]*\([^\)]*\)[\s\:\w]*(?=;)/gs);
	Array.from(matches).forEach((val) => {
		var func = val[0];
		methods.push({
			declaration: func.replace('abstract', '').trim().replace('  ', ' '),
			methodName: func.substring(func.indexOf('function') + 8, func.indexOf('(')).trim()
		});
	});

	return methods;
}

async function getFileText(namespace) {
	var text;
    var workspaceFolder = vscode.workspace.getWorkspaceFolder(doc.uri).uri.fsPath;
	var file = vscode.Uri.file(workspaceFolder + "/" + namespace.replaceAll("\\", "/") + '.php');
	text = await vscode.workspace.fs.readFile(file).then((data) => data.toString());

	return text;
}

// this method is called when your extension is deactivated
function deactivate() {}

module.exports = {
	activate,
	deactivate
}
