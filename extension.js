// The module 'vscode' contains the VS Code extensibility API
// Import the module and reference it with the alias vscode in your code below
const vscode = require('vscode');

// this method is called when your extension is activated
// your extension is activated the very first time the command is executed

var editor;
var doc;
var paths = {};
var composerPaths = {};
var useComposer;
var composerJsonPath;

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

  async function refreshComposerPaths(newComposerJsonPath) {
    if (!doc) return;

    let workspaceFolder = vscode.workspace.getWorkspaceFolder(doc.uri);
    if (!workspaceFolder) return;
    workspaceFolder = workspaceFolder.uri.fsPath;

    let filepath = workspaceFolder+'/'+newComposerJsonPath+'/'+'composer.json';
    filepath = filepath.replace(/\/\//g, '/');

    let file = vscode.Uri.file(filepath);

    let text;
    try {
      text = await vscode.workspace.fs.readFile(file).then((data) => data.toString());
    } catch(e) {
      vscode.window.showErrorMessage(`File at path \"${filepath}\" not found! Make sure you specified correct "php-implementor.composerPath" option in your ".vscode/settings.json".`);
      throw e;
    }

    const composerConfigs = JSON.parse(text);

    composerPaths = {};
    if (composerConfigs) {
      if (composerConfigs.autoload) {
        composerPaths = composerConfigs.autoload['psr-4'] || {};
        for (let namespace in composerPaths) {
          composerPaths[namespace] = newComposerJsonPath+'/'+composerPaths[namespace];
          composerPaths[namespace] = composerPaths[namespace].replace(/\/\//g, '/');
        }
      }

      const setPackagesComposerPaths = async (composerPackages) => {
        let vendorDir = 'vendor';
        if (composerConfigs.config && composerConfigs.config['vendor-dir']) {
          vendorDir = composerConfigs.config['vendor-dir'];
        }
        
        let composerPackageConfigs;
        for (let composerPackage in composerPackages) {
          filepath = workspaceFolder+'/'+vendorDir+'/'+composerPackage+'/'+'composer.json';
          filepath = filepath.replace(/\/\//g, '/');
          file = vscode.Uri.file(filepath);
          composerPackageConfigs = JSON.parse(await vscode.workspace.fs.readFile(file).then((data) => data.toString()));
          
          if (composerPackageConfigs && composerPackageConfigs.autoload) {
            if (composerPackageConfigs.autoload['psr-4']) {
              for (let composerPackageNamespace in composerPackageConfigs.autoload['psr-4']) {
                composerPaths[composerPackageNamespace] = vendorDir+'/'+composerPackage+'/'+composerPackageConfigs.autoload['psr-4'][composerPackageNamespace];
                composerPaths[composerPackageNamespace] = composerPaths[composerPackageNamespace].replace(/\/\//g, '/');
              }
            }

            if (composerPackageConfigs.autoload['classmap']) {
              composerPaths.classmap = typeof(composerPaths.classmap) === 'object' ? composerPaths.classmap : {};
              composerPackageConfigs.autoload['classmap'] = composerPackageConfigs.autoload['classmap'].map(
                el => (vendorDir+'/'+composerPackage+'/'+el).replace(/\/\//g, '/')
              );
              
              filepath = (vendorDir+'/'+composerPackage).replace(/\/\//g, '/');

              const packagePhpFile = (await vscode.workspace.findFiles(filepath+'/src/*.php'))[0];
              file = vscode.Uri.file(packagePhpFile.path);
              const packagePhpFileText = await vscode.workspace.fs.readFile(file).then((data) => data.toString());
              const rootNamespace = getNamespaceOfFile(packagePhpFileText);

              console.log(rootNamespace);

              composerPaths.classmap[rootNamespace] = composerPackageConfigs.autoload['classmap'];
            }
          }
        }
      }
      if (composerConfigs.require) {
        await setPackagesComposerPaths(composerConfigs.require);
      }
      if (composerConfigs['require-dev']) {
        await setPackagesComposerPaths(composerConfigs['require-dev']);
      }
      console.log(composerPaths);
    }
  }

	async function setConfiguration() {
		var configuration = vscode.workspace.getConfiguration();

		paths = configuration.get('php-implementor.autoloads');

    const newUseComposer = configuration.get('php-implementor.useComposerAutoloads');
    const newComposerJsonPath = configuration.get('php-implementor.composerPath');

    if (newUseComposer && (newUseComposer !== useComposer || newComposerJsonPath !== composerJsonPath)) {
      await refreshComposerPaths(newComposerJsonPath);
    }

    useComposer = newUseComposer;
    composerJsonPath = newComposerJsonPath;

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

	let implementCommand = vscode.commands.registerCommand('php-implementor.implement', async function () {
		var offset = doc.getText().indexOf("{");
		var pos = doc.positionAt(offset + 1);

		insertSnippet(pos);
	});

  let refreshCommand = vscode.commands.registerCommand('php-implementor.refreshComposerAutoloads', async function () {
    if (useComposer) {
      refreshComposerPaths(composerJsonPath);
    }
	});

	context.subscriptions.push(implementCommand);
  context.subscriptions.push(refreshCommand);
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

  var paths = getPaths();
  var classmap = paths.classmap;

  var pathFound = false;
	for(var prop in paths) {
    const reg = `^${prop}`.replace(/\\/g, '\\\\');
    if (namespace.match(new RegExp(reg, 'gs'))) {
      namespace = namespace.replace(prop, paths[prop]);
      pathFound = true;
      break;
    }
	}

  var file, filepath;
  if (pathFound) {
    namespace = namespace.replace(/\\/g, "/").replace(/\/\//g, '/');
    filepath = workspaceFolder + "/" + namespace + '.php';
    filepath = filepath.replace(/\/\//g, '/');
  
    file = vscode.Uri.file(filepath);
  } else {
    for(var classmapRoot in classmap) {
      const reg = `^${classmapRoot}`.replace(/\\/g, '\\\\');
      const filename = namespace.substr(namespace.lastIndexOf('\\') + 1);
      if (namespace.match(new RegExp(reg, 'gs'))) {
        const foundFiles = await vscode.workspace.findFiles(`${classmap[classmapRoot]}**/${filename}.php`);
        for(var foundFile of foundFiles) {
          const fileText = await vscode.workspace.fs.readFile(foundFile).then((data) => data.toString());
          const fileNamespace = getNamespaceOfFile(fileText);
          if (fileNamespace == namespace.substr(0, namespace.lastIndexOf('\\'))) {
            file = foundFile;
            break;
          }
        }
        break;
      }
    }
  }

	try {
		text = await vscode.workspace.fs.readFile(file).then((data) => data.toString());
	} catch(e) {
    let message;
    if (useComposer) {
      message = 'Make sure you specified correct "php-implementor.composerPath" option in your ".vscode/settings.json".';
    } else {
      message = 'Make sure you specified correct root folders in "php-implementor.autoloads" option in your ".vscode/settings.json".';
    }
		vscode.window.showErrorMessage(`File at path \"${filepath}\" not found! ${message}`)
					  .then(val => {
						if (val === action) {
							vscode.commands.executeCommand("workbench.action.openSettings2");
						}
					  });
    throw e;
	}

	return removeCommentsFromText(text);
}

function removeCommentsFromText(text) {
  return text.replace(/\/\/.*$/gm, '').replace(/\/\*(.*?)\*\//gs, '').replace(/\#.*$/gm, '');
}

function getPaths() {
  return useComposer ? composerPaths : paths;
}

// this method is called when your extension is deactivated
function deactivate() {}

module.exports = {
	activate,
	deactivate
}
