// The module 'vscode' contains the VS Code extensibility API
// Import the module and reference it with the alias vscode in your code below
const vscode = require('vscode');

// this method is called when your extension is activated
// your extension is activated the very first time the command is executed

var editor;
var doc;
var paths = {};

/**
 * @param {vscode.ExtensionContext} context
 */
function activate(context) {
	function setEditor() {
		if (vscode.window.activeTextEditor !== undefined) {
			editor = vscode.window.activeTextEditor;
			doc = editor.document;
		}
	}

	function setConfiguration() {
		var configuration = vscode.workspace.getConfiguration();
		paths = configuration.get('php-implementor.autoloads');
		vscode.commands.executeCommand("setContext", 'php-implementor.showInContextMenu', configuration.get('php-implementor.showInContextMenu'));
	}

	vscode.window.onDidChangeActiveTextEditor(() => {
		setEditor();
	});

	vscode.window.onDidChangeVisibleTextEditors(() => {
		setEditor();
	});

	vscode.workspace.onDidChangeConfiguration(() => {
		setConfiguration();
	});

	setEditor();

	setConfiguration();

	let disposable = vscode.commands.registerCommand('php-implementor.implement', async function () {
		var offset = doc.getText().indexOf("{");
		var pos = doc.positionAt(offset + 1);

		insertSnippet(pos);
	});

	context.subscriptions.push(disposable);
}

async function insertSnippet(pos) {
	var text = "";
	var parents = getAllParents(doc.getText()).then(parents => {
		var methods = [];
		parents.forEach(parent => {
			parent.methods.forEach(method => {
				methods.push(method.declaration);
			});
		});
		vscode.window.showQuickPick(methods, {
			canPickMany: true,
			title: "Choose methods to implement",
			placeHolder: "Choose methods"
		}).then(pickedMethods => {
			pickedMethods.forEach(method => {
				text += "\n\t" + method + "\n\t{\n\t\tthrow new \\Exception(\"Method not implemented\");\n\t}\n\t";
			});
			editor.insertSnippet(new vscode.SnippetString(text.replaceAll('$', '\\$')), pos);
			vscode.window.showInformationMessage('Implemented ' + pickedMethods.length + ' methods!');
		});
	});

	return;
}

function getNamespaceOfFile(text) {
	var nI = text.indexOf('namespace');
	var namespace = text.substring(nI+9, text.indexOf(";", nI)).trim();

	return namespace;
}

function getClassWithNamespace(className, text) {
	var matches = text.match(new RegExp(`use.*${className};`));

	var match;
	if (!matches)
		match = getNamespaceOfFile(text) + "\\" + className;
	else 
		match = matches[0].replace('use', '').replace(';', '').trim();

	return match;
}

async function getAllParents(text, result = []) {
	var eI = text.indexOf('extends');
	var impI = text.indexOf('implements');

	if (eI === -1 && impI === -1)
		return result;

	var parents = [];
	if (eI !== -1) {
		var classes = text.substring(eI+7, impI !== -1 ? impI : text.indexOf("{", eI)).trim();
		while(classes.indexOf(' ') !== -1) {
			classes = classes.replaceAll(' ', '');
		}
	
		classes = classes.split(',');

		classes.forEach($class => {
			parents.push(getClassWithNamespace($class, text));
		});
	}
	if (impI !== -1) {
		var interfaces = text.substring(impI+10, text.indexOf("{", impI)).trim();
		while(interfaces.indexOf(' ') !== -1) {
			interfaces = interfaces.replaceAll(' ', '');
		}

		interfaces = interfaces.split(',');

		interfaces.forEach(interface => {
			parents.push(getClassWithNamespace(interface, text));
		});
	}

		
	for (const parent of parents) {
		var parentText = await getFileText(parent);

		await getAllParents(parentText, result);
	
		result.push({
			parent: parent,
			methods: getAbstractMethods(parentText)
		});
	}
	
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
	var matches = text.matchAll(/(?<=\s)(((public)|(static)|(protected)|(private)|(final))\s+)*function[^\n;]*\([^\)]*\)[^{\(\)]*(?={)/gs);
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
	var matches = text.matchAll(/(?<=\s)(((public)|(static)|(protected)|(private)|(abstract))\s+)*function[^\n;]*\([^\)]*\)[\s\:\w]*(?=;)/gs);
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

	for(var prop in paths) {
		namespace = namespace.replace(prop, paths[prop]);
	}

	namespace = namespace.replaceAll("\\", "/").replaceAll('//', '/');
	var filepath = workspaceFolder + "/" + namespace + '.php';

	var file = vscode.Uri.file(filepath);

	try {
		text = await vscode.workspace.fs.readFile(file).then((data) => data.toString());
	} catch(e) {
		var action = "Go to settings";
		vscode.window.showErrorMessage(`File at path \"${filepath}\" not found! Try changing extension configuration in "Extensions"->"PHP Implementor".`, action)
					  .then(val => {
						if (val = action) {
							vscode.commands.executeCommand("workbench.action.openSettings2");
						}
					  });
	}

	return text;
}

// this method is called when your extension is deactivated
function deactivate() {}

module.exports = {
	activate,
	deactivate
}
