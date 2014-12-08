/*
 * Copyright (c) 2014 Danny Moerkerke <danny@dannymoerkerke.nl>
 *
 * Permission is hereby granted, free of charge, to any person obtaining a copy
 * of this software and associated documentation files (the "Software"), to deal
 * in the Software without restriction, including without limitation the rights
 * to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
 * copies of the Software, and to permit persons to whom the Software is
 * furnished to do so, subject to the following conditions:
 *
 * The above copyright notice and this permission notice shall be included in all
 * copies or substantial portions of the Software.
 *
 * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
 * IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
 * FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
 * AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
 * LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
 * OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
 * SOFTWARE.
 */


/*jslint vars: true, plusplus: true, devel: true, nomen: true,  regexp: true, indent: 4, maxerr: 50 */
/*global define, brackets, $ */

define(function (require, exports, module) {
    "use strict";

    // Brackets modules
    var CommandManager      = brackets.getModule("command/CommandManager"),
        Commands            = brackets.getModule("command/Commands"),
        EditorManager       = brackets.getModule("editor/EditorManager"),
        DocumentManager     = brackets.getModule("document/DocumentManager"),
        KeyBindingManager   = brackets.getModule("command/KeyBindingManager"),
        Menus               = brackets.getModule("command/Menus"),
        NativeApp           = brackets.getModule("utils/NativeApp"),
        ProjectManager      = brackets.getModule("project/ProjectManager"),
        FileUtils           = brackets.getModule("file/FileUtils"),
        StringUtils         = brackets.getModule("utils/StringUtils"),
        Async               = brackets.getModule("utils/Async");


    // Constants
    var NAVIGATE_CODEINTEL  = "Codeintel",
        CMD_CODEINTEL    = "dannymoerkerke.codeIntel";
    
    function getSelection(editor) {
        var sel = editor.getSelection();
        if (sel.start.line !== sel.end.line) {
            return null;
        }

        var selection = editor.getSelectedText();

        if (!selection) {
            editor.selectWordAt(sel.start);
            selection = editor.getSelectedText();
        }
        var prefix = editor.document.getRange({line: sel.start.line, ch: sel.start.ch-1}, {line: sel.start.line, ch: sel.start.ch});
        return {text: selection, prefix: prefix};
    }
    
    
    function findMethod(name, doc) {
        var deferred = new $.Deferred();
        
        var lines = StringUtils.getLines(doc.getText());
        var matchedLine;
        
        lines.map(function(line, index) {
           if(line.match('function ' + name)) {
               matchedLine = index;
           } 
        });

        if(matchedLine) {
            deferred.resolve(matchedLine, doc);
        }
        else {
            getParent(doc)
            .then(function(parent) {
                findMethod(name, parent);
            });
        }
        
        return deferred.promise();
    }
    
    function getParent(doc) {
        
        var deferred = new $.Deferred();
        var lines = StringUtils.getLines(doc.getText());
        
        lines.map(function(line, index) {
            if(line.match('extends')) {
                var parentName = line.split('extends').pop().trim();
                
                findFile(parentName, doc)
                .then(function(file) {
                    DocumentManager.getDocumentForPath(file.fullPath)
                    .then(function(parentDoc) {
                       deferred.resolve(parentDoc); 
                    });
                });
            } 
        });
        
        return deferred.promise();
    }
    
    function findFile(name, doc) {
        var deferred = new $.Deferred();
        
        var curFile = doc.file;
        
        var ext = curFile.fullPath.split('.').pop();
        var targetFile = name + '.' + ext;
        var root = ProjectManager.getProjectRoot();
        searchDirectory(root, targetFile, deferred);
        
        return deferred.promise();
    }
    
    
    function searchDirectory(directory, targetFile, deferred) {
        
        directory.getContents(function(a,items) {
            
            items.forEach(function(item) {
                if(typeof item.getContents === 'function') {
                    searchDirectory(item, targetFile, deferred); 
                }
                if(FileUtils.compareFilenames(FileUtils.getBaseName(item.fullPath), targetFile) === 0) {
                    
                    deferred.resolve(item);
                }
            });
            
        });
    }

    function openFile(file) {
        CommandManager.execute(Commands.CMD_ADD_TO_WORKINGSET_AND_OPEN, {fullPath: file.fullPath})
        .done(function(file) {
            console.log(file);
        })
        .fail(function(e) {
            console.error(e);
        })
        .always(function() {
            console.log('always', arguments);
        });
    }
    
    function selectLineInDoc(matchedLine, doc) {
        
        if(doc !== DocumentManager.getCurrentDocument()) {
            CommandManager.execute(Commands.CMD_ADD_TO_WORKINGSET_AND_OPEN, {fullPath: doc.file.fullPath})
            .done(function() {
                var editor = EditorManager.getActiveEditor();
                editor.setCursorPos(matchedLine);
            });
        }
        else {
            editor.setCursorPos(matchedLine);
        }
    }
   
    function handleCodeIntel() {
        
        var editor = EditorManager.getActiveEditor();
        var curDoc = editor.document;
        var sel = getSelection(editor);
        
        if(sel.prefix === '.' || sel.prefix === '>') {
            findMethod(sel.text, curDoc) 
            .then(selectLineInDoc);
        }
        else {
            findFile(sel.text, curDoc)
            .then(openFile)
            .fail(function(e) {
                console.error(e);
            });
        }
    }


    // Register the command and shortcut
    CommandManager.register(
        NAVIGATE_CODEINTEL,
        CMD_CODEINTEL,
        handleCodeIntel
    );
    KeyBindingManager.addBinding(CMD_CODEINTEL, "Ctrl-Alt-Space", "linux");
    KeyBindingManager.addBinding(CMD_CODEINTEL, "Cmd-Shift-Space", "mac");

    // Create a menu item bound to the command
    var menu = Menus.getMenu(Menus.AppMenuBar.NAVIGATE_MENU);
    menu.addMenuItem(CMD_CODEINTEL);
});
