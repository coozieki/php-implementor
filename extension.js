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
	var parents = getAllParents(removeCommentsFromText(doc.getText())).then(parents => {
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
			if (pickedMethods === undefined)
				return; 
			pickedMethods.forEach(method => {
				text += "\n\t" + method + "\n\t{\n\t\tthrow new \\Exception(\"Method not implemented\");\n\t}\n\t";
			});
			editor.insertSnippet(new vscode.SnippetString(text.replace(/\$/g, '\\$')), pos);
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

function formatNamespace(namespace) {
	while (namespace.indexOf("\\\\") !== -1) {
		namespace = namespace.replace("\\\\", "\\");
	}

	return namespace;
}

function getClassWithNamespace(className, text) {
	var match = null;
	var matches;
	if (className.indexOf('\\') !== -1) {
		match = className;
		if (match.indexOf("\\") === 0) {
			match = match.replace("\\", '');
		}
		var namespace = match.substring(0, match.lastIndexOf("\\"));
		if (namespace.indexOf('namespace') === 0) {
			match = match.replace(namespace, namespace.replace('namespace', getNamespaceOfFile(text)));
		} else {
			var regExp = `(?<=use)[^;]+${namespace}\\s*(?=;)`;
			matches = text.match(new RegExp(regExp, "gs")); 
			if (matches) {
				match = match.replace(namespace, matches[0].trim());
			}
		}
	} else {
		var regExp = `(?<=use)[^;]+[\\s]+(?=as[\\s]+${className};)`;
		matches = text.match(new RegExp(regExp, "gs"));
		if (!matches) {
			matches = text.match(new RegExp(`(?<=use)[\\s]+[^;]+${className}(?=;)`, "gs"));
		}

		if (matches) {
			match = matches[0];
		}
	}

	if (!match)
		match = getNamespaceOfFile(text) + "\\" + className;
	else 
		match = match.trim();

	match = formatNamespace(match);

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
			classes = classes.replace(/ /g, '');
		}
	
		classes = classes.split(',');

		classes.forEach($class => {
			parents.push(getClassWithNamespace($class, text));
		});
	}
	if (impI !== -1) {
		var interfaces = text.substring(impI+10, text.indexOf("{", impI)).trim();
		while(interfaces.indexOf(' ') !== -1) {
			interfaces = interfaces.replace(/ /g, '');
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

	namespace = namespace.replace(/\\/g, "/").replace(/\/\//g, '/');
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

	return removeCommentsFromText(text);
}

function removeCommentsFromText(text) {
  return text.replace(/\/\/.*$/gm, '').replace(/\/\*(.*?)\*\//gs, '').replace(/\#.*$/gm, '');
}

// this method is called when your extension is deactivated
function deactivate() {}

module.exports = {
	activate,
	deactivate
}
