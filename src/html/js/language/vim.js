/* language/vim.js
 * Monaco language for Vimscript (.vim, .vimrc).
 * Highlights:
 *  - Comments starting with " (double-quote) → comment (green)
 *  - Keywords (if/else/endif, function/endfunc, let, set, call, command, map…)
 *  - Variables g:/b:/s:/l:/a:/v:  → token 'type' (yellow)
 *  - Options &option and registers @x → token 'type'
 *  - Function calls foo(...) → token 'keyword' (so they pop)
 */
export function registerVimLanguage(monaco) {
  console.log("INFO | registering Monaco language: vim");

  monaco.languages.register({
    id: "vim",
    extensions: [".vim"],
    filenames: [".vimrc", "_vimrc", "vimrc", "gvimrc", ".gvimrc"],
    aliases: ["Vim", "vim", "vimscript"],
    mimetypes: ["text/x-vim"],
  });

  monaco.languages.setLanguageConfiguration("vim", {
    comments: { lineComment: '"' },  // Vim uses a double-quote for comments
    brackets: [
      ["(", ")"],
      ["[", "]"],
      ["{", "}"],
    ],
    autoClosingPairs: [
      { open: "(", close: ")" },
      { open: "[", close: "]" },
      { open: "{", close: "}" },
      { open: "'", close: "'" },
      { open: '"', close: '"' },
    ],
    surroundingPairs: [
      { open: "(", close: ")" },
      { open: "[", close: "]" },
      { open: "{", close: "}" },
      { open: "'", close: "'" },
      { open: '"', close: '"' },
    ],
    wordPattern:
      /(-?\d*\.\d\w*)|([^\s\`\~\!\@\#\$\%\^\&\*\(\)\=\+\[\]\{\}\\\|\;\:\'\"\<\>\,\.\/\?]+)/g,
  });

  monaco.languages.setMonarchTokensProvider("vim", {
    defaultToken: "",
    ignoreCase: true,

    // keyword sets
    keywords: [
      "if","elseif","else","endif","while","endwhile","for","endfor",
      "try","catch","finally","endtry",
      "function","function!","endfunction","endfunc","return","call",
      "let","unlet","lockvar","unlockvar",
      "set","setlocal","setglobal",
      "execute","echo","echom","echomsg","echoerr","silent","redir",
      "augroup","autocmd","doautocmd","doautoall",
      "map","nmap","vmap","xmap","smap","imap","omap","cmap","tmap",
      "nnoremap","vnoremap","xnoremap","snoremap","inoremap","onoremap","cnoremap","tnoremap",
      "command","command!",
      "tabnew","tabnext","tabprev","tabclose","bdelete","bd","file","edit","write","wq","quit","qall", "source"
    ],
    builtins: [
      // a small, useful subset of built-ins
      "expand","system","empty","len","split","join","getline","setline","add","remove",
      "exists","has","isdirectory","fnamemodify","substitute","match","matchstr","printf",
    ],

    tokenizer: {
      root: [
        // comments (from first unescaped " to end-of-line)
        [/^\s*".*$/, "comment"],
        [/".*$/, "comment"],

        // numbers
        [/\b\d+\b/, "number"],

        // strings (single or double quoted)
        [/'([^'\\]|\\.)*'/, "string"],
        [/"([^"\\]|\\.)*"/, "string"],

        // variable prefixes & options/registers
        [/\b[gbslav]:[A-Za-z_][A-Za-z0-9_]*/, "type"],  // g:var, b:var, s:var, l:var, a:var, v:var
        [/&[A-Za-z_][A-Za-z0-9_]*/, "type"],            // &option
        [/@[A-Za-z0-9"%-]/, "type"],                    // @a, @" etc.

        // function calls: name(...)
        [/\b[A-Za-z_][A-Za-z0-9_]*\s*(?=\()/, {
          cases: {
            "@builtins": "keyword",   // pop more
            "@default": "keyword"
          }
        }],

        // commands/keywords
        [/\b[!A-Za-z_][A-Za-z0-9_]*\b/, {
          cases: {
            "@keywords": "string",
            "@default": "keyword"
          }
        }],

        // operators
        [/==|!=|<=|>=|=~|!~|[+\-*/%]=?|[<>]|[,.;]|::/, "operator"],

        // everything else
        [/[{}()\[\]]/, "delimiter"],
        [/[A-Za-z_][A-Za-z0-9_]*/, "identifier"],
        [/\s+/, ""],
      ],
    },
  });

  console.log("INFO | Monaco vim language registered");
}
