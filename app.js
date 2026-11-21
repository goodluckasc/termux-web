(() => {
  'use strict';

  const $ = (id) => document.getElementById(id);
  const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  }[c]));

  // ------------------------------------------------------------------
  // Virtual filesystem
  // ------------------------------------------------------------------
  const dir = (children = {}) => ({ type: 'dir', children });
  const file = (content = '') => ({ type: 'file', content });
  const HOME = ['home', 'user'];

  const FS = dir({
    home: dir({
      user: dir({
        'README.md': file('# Termux Web\n\nA browser-based terminal demo.\nType `help` to see available commands.\n'),
        'notes.txt': file('Shopping list\n-------------\n- coffee\n- keyboard\n- usb cable\n'),
        '.bashrc': file('# ~/.bashrc\nalias ll="ls -la"\nexport EDITOR=nano\nPS1="$ "\n'),
        projects: dir({
          'hello.py': file('print("Hello from Termux Web!")\n\nfor i in range(3):\n    print(i)\n'),
          'todo.txt': file('[x] build app\n[ ] ship app\n[ ] profit\n'),
          'Makefile': file('all:\n\techo building...\n')
        }),
        downloads: dir({
          'photo.jpg': file('(binary JPEG data — 248192 bytes)'),
          'archive.zip': file('(binary ZIP data — 81920 bytes)')
        }),
        '.config': dir({
          termux: dir({ 'settings.ini': file('[terminal]\nfont=JetBrains Mono\nsize=13\ntheme=black\n') })
        })
      }),
      guest: dir({ 'welcome.txt': file('Welcome, guest!\n') })
    }),
    etc: dir({
      hosts: file('127.0.0.1 localhost\n::1 localhost\n'),
      passwd: file('root:x:0:0:root:/root:/bin/bash\nu0_a1:x:10000:10000:Termux:/home/user:/bin/bash\n'),
      'os-release': file('NAME=Termux Web\nVERSION=1.0\nID=termux-web\n')
    }),
    sdcard: dir({
      DCIM: dir({ 'IMG_20261121_120000.jpg': file('(binary JPEG data)') }),
      Download: dir({ 'termux.apk': file('(binary APK data — 12.4 MB)') }),
      Music: dir({ 'lofi.mp3': file('(binary MP3 data)') }),
      Pictures: dir({})
    }),
    usr: dir({
      bin: dir({ bash: file('(binary)'), ls: file('(binary)'), nano: file('(binary)') }),
      share: dir({ termux: dir({ 'welcome.md': file('Welcome to Termux!\n\nWiki: https://wiki.termux.com\n') }) })
    }),
    proc: dir({ version: file('Linux version 5.10.101-android12 (build@localhost)\n') }),
    data: dir({ data: dir({}) }),
    system: dir({ bin: dir({}), etc: dir({}) })
  });

  function getNode(path) {
    let node = FS;
    for (const part of path) {
      if (!node || node.type !== 'dir') return null;
      node = node.children[part];
      if (!node) return null;
    }
    return node;
  }

  function parentOf(path) {
    return { parent: getNode(path.slice(0, -1)), name: path[path.length - 1] };
  }

  function resolvePath(s, input = '') {
    let str = String(input || '');
    if (str === '' || str === '.') str = './';
    if (str === '~') str = HOME.join('/');
    else if (str.startsWith('~/')) str = HOME.join('/') + str.slice(1);
    else if (!str.startsWith('/')) str = s.cwd.join('/') + '/' + str;

    const parts = [];
    for (const p of str.split('/')) {
      if (p === '' || p === '.') continue;
      if (p === '..') parts.pop();
      else parts.push(p);
    }
    return parts;
  }

  function shortPath(s) {
    const abs = '/' + s.cwd.join('/');
    if (abs === '/' + HOME.join('/')) return '~';
    if (abs.startsWith('/' + HOME.join('/') + '/')) return '~' + abs.slice(HOME.join('/').length + 1);
    return abs;
  }

  function nodeSize(node) {
    return node.type === 'dir' ? '4096' : String(node.content.length);
  }

  // ------------------------------------------------------------------
  // Output helpers
  // ------------------------------------------------------------------
  function out(s, html) {
    const d = document.createElement('div');
    d.className = 'line';
    d.innerHTML = html;
    s.screen.appendChild(d);
    return d;
  }
  const println = (s, text = '') => out(s, esc(text));
  const printLines = (s, text) => String(text).split('\n').forEach((l) => println(s, l));
  function raw(s, text) {
    const last = s.screen.lastElementChild;
    if (last && last.classList.contains('line')) last.innerHTML += esc(text);
    else println(s, text);
  }
  function scrollBottom() {
    const w = $('terminalWrap');
    w.scrollTop = w.scrollHeight;
  }
  function clearScreen(s, addPrompt = true) {
    s.screen.innerHTML = '';
    if (addPrompt) createPrompt(s);
    scrollBottom();
  }

  // ------------------------------------------------------------------
  // Sessions
  // ------------------------------------------------------------------
  let sessions = [];
  let activeId = null;
  let nextId = 1;

  const activeSession = () => sessions.find((s) => s.id === activeId) || sessions[0];

  function promptHTML(s) {
    return '<span class="p-user">u0_a1@localhost</span><span class="p-sym">:</span>' +
      '<span class="p-path">' + esc(shortPath(s)) + '</span><span class="p-sym">$</span>';
  }

  function createPrompt(s) {
    const row = document.createElement('div');
    row.className = 'prompt-row';
    const p = document.createElement('span');
    p.className = 'prompt';
    p.innerHTML = promptHTML(s);
    const input = document.createElement('input');
    input.className = 'cmd-input';
    input.type = 'text';
    input.spellcheck = false;
    input.autocomplete = 'off';
    input.autocapitalize = 'off';
    input.setAttribute('aria-label', 'Terminal input');
    row.append(p, input);
    s.screen.appendChild(row);
    s.input = input;
    s.row = row;
    input.addEventListener('keydown', (e) => onKey(e, s));
    if (s.id === activeId) setTimeout(() => input.focus(), 0);
  }

  function boot(s) {
    out(s, '<span class="c-green bold">Termux Web</span> <span class="c-gray">v1.0.0 (browser build)</span>');
    out(s, '<span class="c-gray">https://termux.dev — running locally in your browser</span>');
    println(s, '');
    out(s, '<span class="c-green bold">Welcome to Termux Web!</span>');
    println(s, '');
    println(s, '  Working with commands:');
    out(s, '    <span class="c-cyan">help</span>          list every available command');
    out(s, '    <span class="c-cyan">ls</span> / <span class="c-cyan">cd</span>       browse the virtual filesystem');
    out(s, '    <span class="c-cyan">neofetch</span>     show system information');
    out(s, '    <span class="c-cyan">pkg install python</span>  unlock extra demo commands');
    println(s, '');
    out(s, '<span class="c-gray">Tip: use Tab to autocomplete, ↑/↓ for history, Ctrl+L to clear.</span>');
    println(s, '');
  }

  function makeSession(name) {
    const s = {
      id: nextId,
      name: name || 'session ' + nextId,
      cwd: HOME.slice(),
      history: [],
      histIdx: 0,
      bootAt: Date.now(),
      env: {
        HOME: '/home/user', USER: 'u0_a1', SHELL: '/bin/bash', PREFIX: '/data/data/com.termux/files/usr',
        EDITOR: 'nano', TERM: 'xterm-256color', LANG: 'en_US.UTF-8'
      },
      screen: document.createElement('div')
    };
    nextId++;
    s.screen.className = 'screen';
    s.screen.dataset.id = s.id;
    $('screens').appendChild(s.screen);
    sessions.push(s);
    boot(s);
    createPrompt(s);
    setActive(s.id);
    renderSessionList();
    return s;
  }

  function setActive(id) {
    activeId = id;
    sessions.forEach((s) => s.screen.classList.toggle('active', s.id === id));
    const s = activeSession();
    if (s) {
      $('sessionName').textContent = s.name;
      setTimeout(() => { s.input && s.input.focus(); scrollBottom(); }, 0);
    }
    renderSessionList();
  }

  function renderSessionList() {
    const list = $('sessionList');
    list.innerHTML = '';
    sessions.forEach((s) => {
      const item = document.createElement('div');
      item.className = 'session-item' + (s.id === activeId ? ' active' : '');
      item.innerHTML = '<span class="session-dot"></span><span class="sname">' + esc(s.name) +
        '</span><span class="spath">' + esc(shortPath(s)) + '</span>';
      item.addEventListener('click', () => { setActive(s.id); closeDrawer(); });
      list.appendChild(item);
    });
  }

  function closeSession(id = activeId) {
    if (sessions.length <= 1) {
      const s = activeSession();
      clearScreen(s);
      println(s, 'Cannot close the last session.');
      closeDrawer();
      return;
    }
    const idx = sessions.findIndex((s) => s.id === id);
    if (idx < 0) return;
    sessions[idx].screen.remove();
    sessions.splice(idx, 1);
    setActive(sessions[Math.max(0, idx - 1)].id);
  }

  function openDrawer() { $('drawer').classList.add('open'); $('scrim').classList.add('show'); }
  function closeDrawer() { $('drawer').classList.remove('open'); $('scrim').classList.remove('show'); }

  // ------------------------------------------------------------------
  // Input handling
  // ------------------------------------------------------------------
  function tokenize(str) {
    const out = [];
    let cur = '', quote = null;
    for (let i = 0; i < str.length; i++) {
      const ch = str[i];
      if (quote) {
        if (ch === quote) quote = null;
        else if (ch === '\\' && quote === '"' && i + 1 < str.length) cur += str[++i];
        else cur += ch;
      } else if (ch === '"' || ch === "'") quote = ch;
      else if (/\s/.test(ch)) { if (cur) { out.push(cur); cur = ''; } }
      else cur += ch;
    }
    if (cur) out.push(cur);
    return out;
  }

  function insertAtCaret(input, text) {
    const start = input.selectionStart ?? input.value.length;
    const end = input.selectionEnd ?? start;
    input.setRangeText(text, start, end, 'end');
    input.focus();
  }

  function historyNav(s, delta) {
    if (!s.history.length) return;
    s.histIdx = Math.max(0, Math.min(s.history.length, s.histIdx + delta));
    s.input.value = s.history[s.histIdx] || '';
    requestAnimationFrame(() => s.input.setSelectionRange(s.input.value.length, s.input.value.length));
  }

  function complete(s) {
    const v = s.input.value;
    const parts = v.split(/\s+/);
    if (parts.length <= 1) {
      const matches = Object.keys(COMMANDS).filter((c) => c.startsWith(v) && isAvailable(COMMANDS[c]));
      if (matches.length === 1) s.input.value = matches[0] + ' ';
      else if (matches.length > 1) {
        println(s, v);
        out(s, matches.map((m) => '<span class="c-cyan">' + esc(m) + '</span>').join('   '));
        println(s, '');
      }
      return;
    }
    const token = parts[parts.length - 1];
    const slash = token.lastIndexOf('/');
    const base = slash >= 0 ? token.slice(0, slash + 1) : '';
    const frag = slash >= 0 ? token.slice(slash + 1) : token;
    const basePath = base ? resolvePath(s, base) : s.cwd.slice();
    const node = getNode(basePath);
    if (!node || node.type !== 'dir') return;
    const matches = Object.keys(node.children).filter((n) => n.startsWith(frag));
    if (matches.length === 1) {
      const suffix = node.children[matches[0]].type === 'dir' ? '/' : ' ';
      parts[parts.length - 1] = base + matches[0] + suffix;
      s.input.value = parts.join(' ');
    } else if (matches.length > 1) {
      println(s, v);
      out(s, matches.map((m) => '<span class="' + (node.children[m].type === 'dir' ? 'c-cyan' : '') + '">' + esc(m) + '</span>').join('   '));
      println(s, '');
    }
  }

  function cancelLine(s) {
    const echo = document.createElement('span');
    echo.textContent = s.input.value;
    s.row.insertBefore(echo, s.input);
    s.input.remove();
    out(s, '<span class="c-gray">^C</span>');
    createPrompt(s);
    scrollBottom();
    s.input.focus();
  }

  function submit(s) {
    const value = s.input.value;
    const echo = document.createElement('span');
    echo.className = 'cmd-echo';
    echo.textContent = value;
    s.row.insertBefore(echo, s.input);
    s.input.remove();
    s.row.classList.add('static');

    if (value.trim()) {
      s.history.push(value);
      s.histIdx = s.history.length;
      const tokens = tokenize(value);
      const cmd = tokens.shift();
      const command = COMMANDS[cmd];
      if (command && command.pkg && !INSTALLED.has(command.pkg)) {
        out(s, '<span class="c-red">' + esc(cmd) + ': command not found</span>');
        out(s, '<span class="c-gray">Install it with <span class="c-cyan">pkg install ' + esc(command.pkg) + '</span></span>');
      } else if (command) {
        try { command.run(tokens, s); }
        catch (err) { out(s, '<span class="c-red">' + esc(cmd) + ': ' + esc(err.message || String(err)) + '</span>'); }
      } else {
        out(s, '<span class="c-red">' + esc(cmd) + ': command not found</span>');
        out(s, '<span class="c-gray">Type <span class="c-cyan">help</span> to see available commands.</span>');
      }
    }
    if (!s.deferPrompt) createPrompt(s);
    s.deferPrompt = false;
    scrollBottom();
    if (s.input) s.input.focus();
  }

  function ctrlKey(s, key) {
    const k = key.toLowerCase();
    if (k === 'c') cancelLine(s);
    else if (k === 'l' || k === 'u') clearScreen(s);
    else if (k === 'a') s.input.setSelectionRange(0, 0);
    else if (k === 'e') s.input.setSelectionRange(s.input.value.length, s.input.value.length);
    else if (k === 'k') s.input.value = s.input.value.slice(0, s.input.selectionStart ?? 0);
  }

  function onKey(e, s) {
    if (e.ctrlKey && !e.altKey) {
      if (['c', 'l', 'u', 'a', 'e', 'k'].includes(e.key.toLowerCase())) {
        e.preventDefault();
        ctrlKey(s, e.key);
        return;
      }
    }
    switch (e.key) {
      case 'Enter': e.preventDefault(); submit(s); break;
      case 'ArrowUp': e.preventDefault(); historyNav(s, -1); break;
      case 'ArrowDown': e.preventDefault(); historyNav(s, 1); break;
      case 'Tab': e.preventDefault(); complete(s); break;
      case 'Escape': e.preventDefault(); s.input.value = ''; break;
      default: break;
    }
  }

  const sticky = { ctrl: false, alt: false };
  $('extraKeys').addEventListener('click', (e) => {
    const b = e.target.closest('button');
    if (!b) return;
    const s = activeSession();
    if (!s.input) return;
    const key = b.dataset.key;
    s.input.focus();

    if (key === 'ctrl' || key === 'alt') {
      sticky[key] = !sticky[key];
      b.classList.toggle('sticky', sticky[key]);
      return;
    }
    if (key === 'esc') { s.input.value = ''; }
    else if (key === 'tab') { complete(s); }
    else if (key === 'up') { historyNav(s, -1); }
    else if (key === 'down') { historyNav(s, 1); }
    else if (key === 'left' || key === 'right') {
      const pos = s.input.selectionStart ?? 0;
      const next = key === 'left' ? Math.max(0, pos - 1) : Math.min(s.input.value.length, pos + 1);
      s.input.setSelectionRange(next, next);
    } else if (sticky.ctrl) {
      ctrlKey(s, key);
    } else {
      insertAtCaret(s.input, key);
    }
    if (sticky.ctrl) {
      sticky.ctrl = false;
      document.querySelector('[data-key="ctrl"]').classList.remove('sticky');
    }
  });

  $('terminalWrap').addEventListener('click', (e) => {
    if (e.target.closest('button, input')) return;
    const s = activeSession();
    if (window.getSelection().toString() === '') s.input && s.input.focus();
  });

  // ------------------------------------------------------------------
  // Packages (system-wide, shared by all sessions)
  // ------------------------------------------------------------------
  const PACKAGES = [
    { name: 'bash', desc: 'GNU Bourne Again Shell', commands: ['bash'] },
    { name: 'curl', desc: 'HTTP client', commands: ['curl'] },
    { name: 'git', desc: 'Distributed version control system', commands: ['git'] },
    { name: 'grep', desc: 'Pattern search utility', commands: ['grep'] },
    { name: 'nano', desc: 'Small text editor', commands: ['nano'] },
    { name: 'nodejs', desc: 'Node.js JavaScript runtime', commands: ['node', 'npm'] },
    { name: 'nmap', desc: 'Network exploration and security scanner', commands: ['nmap'] },
    { name: 'openssh', desc: 'SSH client and tools', commands: ['ssh', 'scp'] },
    { name: 'python', desc: 'Python 3 language and tools', commands: ['python', 'python3', 'pip', 'pip3'] },
    { name: 'rsync', desc: 'Fast file copying tool', commands: ['rsync'] },
    { name: 'termux-api', desc: 'Android device API bridge', commands: ['termux-battery-status'] },
    { name: 'tmux', desc: 'Terminal multiplexer', commands: ['tmux'] },
    { name: 'vim', desc: 'Vi IMproved editor', commands: ['vim'] },
    { name: 'wget', desc: 'Non-interactive network downloader', commands: ['wget'] },
    { name: 'zsh', desc: 'Z shell', commands: ['zsh'] }
  ];
  const STORAGE_KEY = 'termux-web-installed';
  const INSTALLED = new Set((() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) return JSON.parse(saved);
    } catch (e) { /* storage unavailable — use defaults */ }
    return ['bash', 'curl', 'grep', 'nano', 'termux-api'];
  })());
  const findPackage = (name) => PACKAGES.find((p) => p.name === name);

  function persistPackages() {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify([...INSTALLED])); }
    catch (e) { /* storage unavailable — session-only installs */ }
  }

  function markInstalled(name, yes) {
    const p = findPackage(name);
    if (!p) return false;
    if (yes) INSTALLED.add(name); else INSTALLED.delete(name);
    persistPackages();
    const bin = getNode(['usr', 'bin']);
    if (bin && bin.type === 'dir') {
      p.commands.forEach((c) => {
        if (yes && !bin.children[c]) bin.children[c] = file('(binary — simulated)');
        if (!yes && bin.children[c]) delete bin.children[c];
      });
    }
    return true;
  }

  // ------------------------------------------------------------------
  // Commands
  // ------------------------------------------------------------------
  const COMMANDS = {};
  const cmd = (name, usage, desc, run, pkg = null) => { COMMANDS[name] = { name, usage, desc, run, pkg }; };
  const isAvailable = (c) => !c.pkg || INSTALLED.has(c.pkg);

  cmd('help', 'help [command]', 'Show this help list, or help for one command', (args, s) => {
    if (args.length) {
      const c = COMMANDS[args[0]];
      if (!c) return println(s, 'help: no help for ' + args[0]);
      out(s, '<span class="c-green bold">' + esc(c.name) + '</span> — ' + esc(c.desc));
      return out(s, '<span class="c-gray">Usage: </span><span class="c-cyan">' + esc(c.usage) + '</span>');
    }
    out(s, '<span class="c-green bold">Available commands</span>');
    println(s, '');
    const names = Object.keys(COMMANDS).filter((n) => isAvailable(COMMANDS[n]));
    const max = Math.max(...names.map((n) => n.length)) + 2;
    names.forEach((n) => {
      const c = COMMANDS[n];
      out(s, '  <span class="c-cyan">' + esc(n.padEnd(max)) + '</span><span class="c-gray">' + esc(c.desc) + '</span>');
    });
    println(s, '');
    out(s, '<span class="c-gray">Install more: </span><span class="c-cyan">pkg list-all</span><span class="c-gray">, </span><span class="c-cyan">pkg install python git nmap</span>');
    out(s, '<span class="c-gray">Keys: Tab complete · ↑/↓ history · Ctrl+C cancel · Ctrl+L clear</span>');
  });

  cmd('ls', 'ls [-a] [-l] [path...]', 'List directory contents', (args, s) => {
    let all = false, long = false;
    const targets = args.filter((a) => {
      if (a === '-a' || a === '-al' || a === '-la') { all = true; long = a.length > 2; return false; }
      if (a === '-l') { long = true; return false; }
      return true;
    });
    const paths = targets.length ? targets : ['.'];
    paths.forEach((t, i) => {
      const path = resolvePath(s, t);
      const node = getNode(path);
      if (!node) return out(s, '<span class="c-red">ls: cannot access ' + esc(t) + ': No such file or directory</span>');
      if (paths.length > 1) out(s, '<span class="c-blue">' + esc(t) + ':</span>');
      if (node.type === 'file') {
        out(s, '<span>' + esc(t.split('/').pop()) + '</span>');
        return;
      }
      const names = Object.keys(node.children).filter((n) => all || !n.startsWith('.')).sort();
      if (long) {
        out(s, '<span class="c-gray">total ' + names.length + '</span>');
        names.forEach((n) => {
          const child = node.children[n];
          const perm = child.type === 'dir' ? 'drwxr-xr-x' : '-rw-r--r--';
          const color = child.type === 'dir' ? 'c-blue' : '';
          out(s, '<span class="c-gray">' + perm + '  u0_a1  ' + nodeSize(child).padStart(6) + '  Nov 21 12:00  </span>' +
            '<span class="' + color + '">' + esc(n) + (child.type === 'dir' ? '/' : '') + '</span>');
        });
      } else {
        out(s, names.map((n) => {
          const isDir = node.children[n].type === 'dir';
          return '<span class="' + (isDir ? 'c-blue' : '') + '">' + esc(n) + (isDir ? '/' : '') + '</span>';
        }).join('  '));
      }
      if (i < paths.length - 1) println(s, '');
    });
  });

  cmd('cd', 'cd [directory]', 'Change the current directory', (args, s) => {
    const path = resolvePath(s, args[0] || '~');
    const node = getNode(path);
    if (!node) return out(s, '<span class="c-red">cd: ' + esc(args[0]) + ': No such file or directory</span>');
    if (node.type !== 'dir') return out(s, '<span class="c-red">cd: ' + esc(args[0]) + ': Not a directory</span>');
    s.cwd = path;
    renderSessionList();
  });

  cmd('pwd', 'pwd', 'Print the working directory', (args, s) => println(s, '/' + s.cwd.join('/')));

  cmd('echo', 'echo [-n] [text...]', 'Print text to the terminal', (args, s) => {
    let noNewline = false;
    if (args[0] === '-n') { noNewline = true; args.shift(); }
    const text = args.join(' ');
    if (noNewline) raw(s, text); else println(s, text);
  });

  cmd('cat', 'cat <file...>', 'Print file contents', (args, s) => {
    if (!args.length) return println(s, 'cat: missing file operand');
    args.forEach((a) => {
      const node = getNode(resolvePath(s, a));
      if (!node) return out(s, '<span class="c-red">cat: ' + esc(a) + ': No such file or directory</span>');
      if (node.type === 'dir') return out(s, '<span class="c-red">cat: ' + esc(a) + ': Is a directory</span>');
      printLines(s, node.content.replace(/\n$/, ''));
    });
  });

  cmd('mkdir', 'mkdir [-p] <dir...>', 'Create directories', (args, s) => {
    let parents = false;
    const targets = args.filter((a) => { if (a === '-p') { parents = true; return false; } return true; });
    if (!targets.length) return println(s, 'mkdir: missing operand');
    targets.forEach((t) => {
      const path = resolvePath(s, t);
      if (parents) {
        let node = FS;
        for (const part of path) {
          if (!node.children[part]) node.children[part] = dir();
          else if (node.children[part].type !== 'dir') {
            return out(s, '<span class="c-red">mkdir: cannot create directory ' + esc(t) + ': Not a directory</span>');
          }
          node = node.children[part];
        }
        return;
      }
      const { parent, name } = parentOf(path);
      if (!parent || parent.type !== 'dir') return out(s, '<span class="c-red">mkdir: cannot create directory ' + esc(t) + '</span>');
      if (parent.children[name]) {
        return out(s, '<span class="c-red">mkdir: cannot create directory ' + esc(t) + ': File exists</span>');
      }
      parent.children[name] = dir();
    });
  });

  cmd('touch', 'touch <file...>', 'Create an empty file', (args, s) => {
    if (!args.length) return println(s, 'touch: missing file operand');
    args.forEach((a) => {
      const path = resolvePath(s, a);
      const { parent, name } = parentOf(path);
      if (!parent || parent.type !== 'dir') return out(s, '<span class="c-red">touch: cannot touch ' + esc(a) + '</span>');
      if (!parent.children[name]) parent.children[name] = file('');
    });
  });

  cmd('rm', 'rm [-r] [-f] <path...>', 'Remove files or directories', (args, s) => {
    let recursive = false, force = false;
    const targets = args.filter((a) => {
      if (a === '-r' || a === '-R' || a === '-rf' || a === '-fr') { recursive = true; force = true; return false; }
      if (a === '-f') { force = true; return false; }
      return true;
    });
    targets.forEach((t) => {
      const path = resolvePath(s, t);
      const { parent, name } = parentOf(path);
      const node = getNode(path);
      if (!node || !parent) {
        if (!force) out(s, '<span class="c-red">rm: cannot remove ' + esc(t) + ': No such file or directory</span>');
        return;
      }
      if (node.type === 'dir' && !recursive) {
        return out(s, '<span class="c-red">rm: cannot remove ' + esc(t) + ': Is a directory (use -r)</span>');
      }
      delete parent.children[name];
    });
  });

  function copyOrMove(s, args, move) {
    const verb = move ? 'mv' : 'cp';
    let recursive = false;
    const clean = args.filter((a) => { if (a === '-r' || a === '-R') { recursive = true; return false; } return true; });
    if (clean.length < 2) return println(s, verb + ': missing source or destination');
    const destPath = resolvePath(s, clean[clean.length - 1]);
    let destNode = getNode(destPath);
    clean.slice(0, -1).forEach((src) => {
      const srcPath = resolvePath(s, src);
      const node = getNode(srcPath);
      if (!node) return out(s, '<span class="c-red">' + verb + ': cannot stat ' + esc(src) + ': No such file or directory</span>');
      if (node.type === 'dir' && !recursive) return out(s, '<span class="c-red">' + verb + ': omitting directory ' + esc(src) + '</span>');
      let finalPath = destPath;
      let targetName = destPath[destPath.length - 1];
      if (destNode && destNode.type === 'dir') {
        targetName = srcPath[srcPath.length - 1];
        finalPath = destPath.concat(targetName);
      }
      const { parent } = parentOf(finalPath);
      if (!parent || parent.type !== 'dir') return out(s, '<span class="c-red">' + verb + ': failed</span>');
      parent.children[targetName] = JSON.parse(JSON.stringify(node));
      if (move) {
        const sp = parentOf(srcPath);
        if (sp.parent) delete sp.parent.children[sp.name];
      }
      destNode = getNode(destPath);
    });
  }
  cmd('cp', 'cp [-r] <source> <dest>', 'Copy files or directories', (a, s) => copyOrMove(s, a, false));
  cmd('mv', 'mv <source> <dest>', 'Move or rename files', (a, s) => copyOrMove(s, a, true));

  cmd('clear', 'clear', 'Clear the terminal screen', (args, s) => clearScreen(s, false));
  cmd('reset', 'reset', 'Reset the screen and print the welcome', (args, s) => { clearScreen(s, false); boot(s); scrollBottom(); });

  cmd('history', 'history', 'Show command history', (args, s) => {
    s.history.forEach((h, i) => out(s, '<span class="c-gray">' + String(i + 1).padStart(4) + '  </span>' + esc(h)));
    if (!s.history.length) println(s, 'No history yet.');
  });

  cmd('whoami', 'whoami', 'Print the current user', (args, s) => println(s, 'u0_a1'));
  cmd('id', 'id', 'Print user identity', (args, s) => println(s, 'uid=10000(u0_a1) gid=10000(u0_a1) groups=10000(u0_a1),1015(sdcard_rw)'));

  cmd('uname', 'uname [-a]', 'Print system information', (args, s) => {
    if (args.includes('-a')) println(s, 'Linux localhost 5.10.101-android12 #1 SMP PREEMPT Sat Nov 21 12:00:00 UTC 2026 aarch64 GNU/Linux');
    else println(s, 'Linux');
  });

  cmd('date', 'date', 'Print the current date and time', (args, s) => println(s, new Date().toString()));

  cmd('uptime', 'uptime', 'Show how long the session has been alive', (args, s) => {
    const mins = Math.max(1, Math.round((Date.now() - s.bootAt) / 60000));
    println(s, ' 12:00:01 up ' + mins + ' min,  1 user,  load average: 0.12, 0.08, 0.03');
  });

  cmd('neofetch', 'neofetch', 'Show system info with ASCII art', (args, s) => {
    const art = [
      '        .-.',
      '    .--\'   \'-.',
      '   (         )',
      '    \'-.___.-\'',
      '     \'-----`'
    ].join('\n');
    const colors = ['#e53935', '#fb8c00', '#fdd835', '#43a047', '#1e88e5', '#8e24aa'];
    const blocks = colors.map((c) => '<span style="background:' + c + '">&nbsp;&nbsp;&nbsp;</span>').join('');
    const info = [
      '<span class="c-green bold">u0_a1</span>@<span class="c-green bold">localhost</span>',
      '<span class="c-gray">---------------</span>',
      '<span class="c-yellow">OS</span>: Termux Web 1.0 (browser)',
      '<span class="c-yellow">Host</span>: ' + (navigator.userAgent.includes('Mobile') ? 'Mobile Browser' : 'Desktop Browser'),
      '<span class="c-yellow">Kernel</span>: 5.10.101-android12-aarch64',
      '<span class="c-yellow">Uptime</span>: ' + Math.max(1, Math.round((Date.now() - s.bootAt) / 60000)) + ' mins',
      '<span class="c-yellow">Packages</span>: ' + INSTALLED.size + ' (pkg)',
      '<span class="c-yellow">Shell</span>: bash 5.2.15',
      '<span class="c-yellow">Terminal</span>: Termux Web',
      '<span class="c-yellow">CPU</span>: ARMv8-A (8) @ 2.84GHz',
      '<span class="c-yellow">Memory</span>: 1234MiB / 4096MiB',
      '',
      blocks
    ].join('<br>');
    out(s, '<div class="neofetch"><pre>' + esc(art) + '</pre><div>' + info + '</div></div>');
  });

  cmd('pkg', 'pkg [install|remove|search|list|list-all|info|update]', 'Termux package manager (simulated)', (args, s) => {
    const sub = args[0] || 'list';
    if (sub === 'list' || sub === 'list-installed') {
      [...INSTALLED].sort().forEach((p) => println(s, p + '/stable'));
      return;
    }
    if (sub === 'list-all') {
      PACKAGES.forEach((p) => println(s, p.name + '/stable' + (INSTALLED.has(p.name) ? '  [installed]' : '')));
      return;
    }
    if (sub === 'search') {
      const q = args[1] || '';
      const found = PACKAGES.filter((p) => p.name.includes(q) || p.desc.toLowerCase().includes(q.toLowerCase()));
      if (!found.length) return println(s, 'No results found for ' + q);
      found.forEach((p) => out(s, '<span class="c-green">' + esc(p.name) + '</span>/stable — ' + esc(p.desc) +
        (INSTALLED.has(p.name) ? ' <span class="c-gray">[installed]</span>' : '')));
      return;
    }
    if (sub === 'info') {
      const p = findPackage(args[1]);
      if (!p) return println(s, 'E: Unable to locate package ' + (args[1] || ''));
      println(s, 'Package: ' + p.name);
      println(s, 'Version: 1.0');
      println(s, 'State: ' + (INSTALLED.has(p.name) ? 'installed' : 'not installed'));
      println(s, 'Description: ' + p.desc);
      println(s, 'Provides: ' + p.commands.join(', '));
      return;
    }
    if (sub === 'install' || sub === 'i') {
      const names = args.slice(1);
      if (!names.length) return println(s, 'pkg: missing package name');
      const unknown = names.filter((n) => !findPackage(n));
      if (unknown.length) return out(s, '<span class="c-red">E: Unable to locate package ' + esc(unknown.join(', ')) + '</span>');
      const fresh = names.filter((n) => !INSTALLED.has(n));
      println(s, 'Hit:1 https://termux.org/packages stable InRelease');
      println(s, 'Reading package lists... Done');
      println(s, 'Building dependency tree... Done');
      if (!fresh.length) { println(s, names.join(' ') + ' is already the newest version.'); return; }
      out(s, 'The following NEW packages will be installed:  <span class="c-green">' + esc(fresh.join(' ')) + '</span>');
      println(s, fresh.length + ' upgraded, ' + fresh.length + ' newly installed, 0 to remove.');
      fresh.forEach((n, i) => println(s, 'Get:' + (i + 1) + ' https://termux.org/packages stable/' + n + ' [1.2 MB]'));
      println(s, 'Fetched ' + fresh.length + '.2 MB in 0s (demo)');
      fresh.forEach((n) => { println(s, 'Installing ' + n + '...'); markInstalled(n, true); });
      const unlocked = [...new Set(fresh.flatMap((n) => findPackage(n).commands))].filter((c) => COMMANDS[c] && COMMANDS[c].pkg);
      out(s, '<span class="c-green">Success! Installed ' + esc(fresh.join(' ')) + '</span> (simulated)');
      if (unlocked.length) out(s, '<span class="c-gray">New commands: </span><span class="c-cyan">' + esc(unlocked.join(', ')) + '</span>');
      return;
    }
    if (sub === 'remove' || sub === 'uninstall') {
      const names = args.slice(1);
      if (!names.length) return println(s, 'pkg: missing package name');
      names.forEach((n) => {
        if (findPackage(n) && INSTALLED.has(n)) markInstalled(n, false);
        else println(s, 'E: Package ' + n + ' is not installed');
      });
      println(s, 'Removed ' + names.join(' ') + ' (simulated)');
      return;
    }
    if (sub === 'update' || sub === 'upgrade') {
      println(s, 'Updating package lists... done (simulated)');
      return;
    }
    println(s, 'pkg: unknown command ' + sub);
  });
  cmd('apt', 'apt [command]', 'Alias for pkg', (args, s) => COMMANDS.pkg.run(args, s));

  cmd('termux-info', 'termux-info', 'Print Termux environment information', (args, s) => {
    println(s, 'Termux Variables:');
    Object.entries(s.env).forEach(([k, v]) => println(s, k + '=' + v));
    println(s, '');
    println(s, 'Packages: ' + INSTALLED.size + ' installed / ' + PACKAGES.length + ' available (simulated)');
  });

  cmd('env', 'env', 'Print environment variables', (args, s) => {
    Object.entries(s.env).forEach(([k, v]) => println(s, k + '=' + v));
  });

  cmd('export', 'export KEY=value', 'Set an environment variable', (args, s) => {
    if (!args.length) return COMMANDS.env.run([], s);
    args.forEach((a) => {
      const i = a.indexOf('=');
      if (i < 1) return out(s, '<span class="c-red">export: invalid assignment: ' + esc(a) + '</span>');
      s.env[a.slice(0, i)] = a.slice(i + 1);
    });
  });

  cmd('ifconfig', 'ifconfig', 'Show network interfaces (demo)', (args, s) => {
    println(s, 'wlan0: flags=4163<UP,BROADCAST,RUNNING,MULTICAST>  mtu 1500');
    println(s, '        inet 192.168.1.42  netmask 255.255.255.0  broadcast 192.168.1.255');
    println(s, '        inet6 fe80::a1b2:c3d4:e5f6:7890  prefixlen 64');
    println(s, '        RX packets 12043  TX packets 8921');
    println(s, '');
    println(s, 'lo: flags=73<UP,LOOPBACK,RUNNING>  mtu 65536');
    println(s, '        inet 127.0.0.1  netmask 255.0.0.0');
  });
  cmd('ip', 'ip addr', 'Show network interfaces (demo)', (args, s) => COMMANDS.ifconfig.run([], s));

  cmd('ps', 'ps', 'List running processes (demo)', (args, s) => {
    println(s, '  PID USER      VSZ STAT COMMAND');
    println(s, '    1 root     9124 S    /init');
    println(s, '  342 shell   14820 S    /bin/bash');
    println(s, ' 1188 u0_a1   22104 S    com.termux');
    println(s, ' 2041 u0_a1   18376 R    ps');
  });

  cmd('top', 'top', 'Show a process snapshot (demo)', (args, s) => {
    println(s, 'top - 12:00:01 up 5 min,  1 user,  load average: 0.12, 0.08, 0.03');
    println(s, 'Tasks: 128 total,   1 running, 127 sleeping');
    println(s, '%Cpu(s):  4.2 us,  1.1 sy,  0.0 ni, 94.7 id');
    println(s, 'MiB Mem :   4096 total,   1234 free,   1800 used,   1062 cache');
    println(s, '');
    println(s, '  PID USER      %CPU %MEM COMMAND');
    println(s, ' 1188 u0_a1     3.1  2.4 com.termux');
    println(s, '  342 shell     0.4  0.9 bash');
  });

  cmd('grep', 'grep [-i] <pattern> <file>', 'Search for a pattern in a file', (args, s) => {
    let insensitive = false;
    const a = args.filter((x) => { if (x === '-i') { insensitive = true; return false; } return true; });
    if (a.length < 2) return println(s, 'usage: grep [-i] pattern file');
    const node = getNode(resolvePath(s, a[1]));
    if (!node || node.type !== 'file') return out(s, '<span class="c-red">grep: ' + esc(a[1]) + ': No such file</span>');
    const needle = insensitive ? a[0].toLowerCase() : a[0];
    node.content.split('\n').forEach((line) => {
      const hay = insensitive ? line.toLowerCase() : line;
      if (hay.includes(needle)) out(s, '<span class="c-yellow">' + esc(line) + '</span>');
    });
  });

  cmd('head', 'head [-n N] <file>', 'Print the first lines of a file', (args, s) => {
    let n = 10;
    let a = args.slice();
    if (a[0] === '-n' && a[1]) { n = parseInt(a[1], 10) || 10; a = a.slice(2); }
    const node = getNode(resolvePath(s, a[0] || ''));
    if (!node || node.type !== 'file') return println(s, 'head: cannot open ' + (a[0] || ''));
    node.content.split('\n').slice(0, n).forEach((l) => println(s, l));
  });

  cmd('tail', 'tail [-n N] <file>', 'Print the last lines of a file', (args, s) => {
    let n = 10;
    let a = args.slice();
    if (a[0] === '-n' && a[1]) { n = parseInt(a[1], 10) || 10; a = a.slice(2); }
    const node = getNode(resolvePath(s, a[0] || ''));
    if (!node || node.type !== 'file') return println(s, 'tail: cannot open ' + (a[0] || ''));
    node.content.split('\n').slice(-n).forEach((l) => println(s, l));
  });

  cmd('wc', 'wc <file>', 'Count lines, words and characters', (args, s) => {
    const node = getNode(resolvePath(s, args[0] || ''));
    if (!node || node.type !== 'file') return println(s, 'wc: ' + (args[0] || '') + ': No such file');
    const c = node.content;
    println(s, [c.split('\n').length - 1, c.trim() ? c.trim().split(/\s+/).length : 0, c.length].map((x) => String(x).padStart(6)).join(' ') + ' ' + (args[0] || ''));
  });

  function treeWalk(node, prefix, s, depth) {
    if (depth > 6) return;
    const names = Object.keys(node.children).sort();
    names.forEach((n, i) => {
      const last = i === names.length - 1;
      const child = node.children[n];
      out(s, '<span class="c-gray">' + prefix + (last ? '└── ' : '├── ') + '</span>' +
        '<span class="' + (child.type === 'dir' ? 'c-blue' : '') + '">' + esc(n) + '</span>');
      if (child.type === 'dir') treeWalk(child, prefix + (last ? '    ' : '│   '), s, depth + 1);
    });
  }
  cmd('tree', 'tree [path]', 'List directory contents recursively', (args, s) => {
    const node = getNode(resolvePath(s, args[0] || '.'));
    if (!node || node.type !== 'dir') return println(s, 'tree: not a directory');
    out(s, '<span class="c-green">' + esc(args[0] || '.') + '</span>');
    treeWalk(node, '', s, 0);
  });

  cmd('find', 'find [path] [-name pattern]', 'Find files by name', (args, s) => {
    let path = '.', pattern = '*';
    const i = args.indexOf('-name');
    if (i >= 0) { pattern = args[i + 1] || '*'; if (i > 0) path = args[0]; }
    else if (args.length) path = args[0];
    const node = getNode(resolvePath(s, path));
    if (!node) return println(s, 'find: ' + path + ': No such file');
    const re = new RegExp('^' + pattern.replace(/[.+?^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*') + '$', 'i');
    function walk(n, p, depth) {
      if (depth > 6) return;
      Object.entries(n.children).forEach(([name, child]) => {
        const full = p + '/' + name;
        if (re.test(name)) println(s, full);
        if (child.type === 'dir') walk(child, full, depth + 1);
      });
    }
    if (node.type === 'dir') walk(node, path.replace(/\/$/, ''), 0);
    else if (re.test(path)) println(s, path);
  });

  cmd('curl', 'curl <url>', 'Fetch a URL (simulated)', (args, s) => {
    if (!args.length) return println(s, 'curl: no URL specified');
    println(s, '  % Total    % Received % Xferd  Average Speed');
    println(s, '100   248  100   248    0     0   12.4K      0 --:--:--');
    println(s, '<!DOCTYPE html>');
    println(s, '<html><body><h1>Demo response</h1></body></html>');
    out(s, '<span class="c-gray">(simulated response for ' + esc(args[0]) + ')</span>');
  });

  cmd('ping', 'ping <host>', 'Ping a host (simulated)', (args, s) => {
    const host = args[0] || 'localhost';
    println(s, 'PING ' + host + ' (127.0.0.1) 56(84) bytes of data.');
    for (let i = 0; i < 4; i++) println(s, '64 bytes from 127.0.0.1: icmp_seq=' + (i + 1) + ' ttl=64 time=' + (12 + i * 3) + '.' + (10 + i) + ' ms');
    println(s, '--- ' + host + ' ping statistics ---');
    println(s, '4 packets transmitted, 4 received, 0% packet loss');
  });

  cmd('sudo', 'sudo <command>', 'Try to run as root', (args, s) => {
    println(s, 'u0_a1 is not in the sudoers file. This incident has been reported. 🐈');
  });

  cmd('seq', 'seq <last> | seq <first> <last>', 'Print a sequence of numbers', (args, s) => {
    const nums = args.map(Number);
    let start = 1, end = 1, step = 1;
    if (nums.length === 1) end = nums[0];
    else if (nums.length >= 2) { start = nums[0]; end = nums[1]; step = nums[2] || 1; }
    if (step === 0 || Number.isNaN(start) || Number.isNaN(end)) return println(s, 'seq: invalid arguments');
    const arr = [];
    if (step > 0) for (let i = start; i <= end; i += step) arr.push(i);
    else for (let i = start; i >= end; i += step) arr.push(i);
    println(s, arr.join(' '));
  });

  cmd('man', 'man <command>', 'Show the manual for a command', (args, s) => COMMANDS.help.run(args, s));

  cmd('exit', 'exit', 'End the current shell', (args, s) => {
    out(s, '<span class="c-gray">logout</span>');
    if (sessions.length > 1) setTimeout(() => closeSession(s.id), 200);
    else out(s, '<span class="c-gray">Use the menu (☰) to manage sessions.</span>');
  });

  cmd('nano', 'nano <file>', 'Open a simple text editor', (args, s) => {
    if (!args.length) return println(s, 'nano: missing file name');
    const path = resolvePath(s, args[0]);
    const { parent, name } = parentOf(path);
    if (!parent || parent.type !== 'dir') return out(s, '<span class="c-red">nano: cannot create ' + esc(args[0]) + '</span>');
    const node = parent.children[name];
    if (node && node.type === 'dir') return out(s, '<span class="c-red">nano: ' + esc(args[0]) + ' is a directory</span>');
    s.deferPrompt = true;
    openEditor(s, args[0], node ? node.content : '');
  });

  // ------------------------------------------------------------------
  // Commands supplied by installable packages (all simulated)
  // ------------------------------------------------------------------
  function pyRun(args, s) {
    if (args.includes('--version') || args.includes('-V')) return println(s, 'Python 3.12.4');
    if (args[0] === '-c') {
      const code = args.slice(1).join(' ');
      const str = code.match(/print\s*\(\s*(['"])(.*?)\1\s*\)/);
      if (str) return println(s, str[2]);
      const math = code.match(/print\s*\(\s*(\d+)\s*([+\-*/])\s*(\d+)\s*\)/);
      if (math) {
        const a = Number(math[1]), b = Number(math[3]);
        const val = math[2] === '+' ? a + b : math[2] === '-' ? a - b : math[2] === '*' ? a * b : (b === 0 ? 'ZeroDivisionError' : a / b);
        return println(s, String(val));
      }
      return out(s, '<span class="c-gray">' + esc(code) + '  →  (simulated output)</span>');
    }
    printLines(s, 'Python 3.12.4 (main, Nov 21 2026) [GCC 12.2.0] on linux\nType "help" for more information.\n>>> (use python -c "print(...)" in this demo)');
  }

  function pipRun(args, s) {
    if (args[0] === 'list') return printLines(s, 'Package    Version\n---------  -------\nrequests   2.31.0\nnumpy      1.26.0\nflask      3.0.0');
    if (args[0] === 'install') {
      const n = args[1] || 'package';
      println(s, 'Collecting ' + n);
      println(s, 'Installing collected package...');
      println(s, 'Successfully installed ' + n + '-1.0 (simulated)');
      return;
    }
    println(s, 'pip 24.0 from /usr/lib/python3.12/site-packages/pip (python 3.12)');
  }

  function nodeRun(args, s) {
    if (args.includes('--version') || args.includes('-v')) return println(s, 'v22.4.0');
    if (args[0] === '-e') {
      const code = args.slice(1).join(' ');
      const m = code.match(/console\.log\s*\(\s*(['"])(.*?)\1\s*\)/);
      return println(s, m ? m[2] : '(simulated output)');
    }
    println(s, 'Node.js v22.4.0 — interactive REPL is not available in this demo');
  }

  cmd('git', 'git [--version|init|status|clone|add|commit|log]', 'Version control (simulated)', (args, s) => {
    const sub = args[0] || 'status';
    if (sub === '--version' || sub === '-v') return println(s, 'git version 2.45.2');
    if (sub === 'init') {
      const gp = s.cwd.concat('.git');
      const { parent, name } = parentOf(gp);
      if (parent && parent.type === 'dir' && !parent.children[name]) {
        parent.children[name] = dir({ HEAD: file('ref: refs/heads/master\n'), config: file('[core]\n\trepositoryformatversion = 0\n') });
      }
      return println(s, 'Initialized empty Git repository in /' + s.cwd.join('/') + '/.git/');
    }
    if (sub === 'status') {
      if (!getNode(s.cwd.concat('.git'))) return out(s, '<span class="c-red">fatal: not a git repository (or any of the parent directories): .git</span>');
      return printLines(s, 'On branch master\n\nnothing to commit, working tree clean');
    }
    if (sub === 'clone') {
      const url = args[1];
      if (!url) return println(s, 'usage: git clone <url>');
      const name = url.replace(/\/$/, '').split('/').pop().replace(/\.git$/, '') || 'repo';
      const path = s.cwd.concat(name);
      const { parent } = parentOf(path);
      if (getNode(path)) return println(s, "fatal: destination path '" + name + "' already exists");
      println(s, "Cloning into '" + name + "'...");
      if (parent && parent.type === 'dir') parent.children[name] = dir({ 'README.md': file('# ' + name + '\n\nCloned from ' + url + ' (simulated)\n') });
      return println(s, 'done. (simulated)');
    }
    if (sub === 'add') return println(s, 'git add: done (simulated)');
    if (sub === 'commit') return printLines(s, '[master (root-commit) 4f2a1c9] demo commit\n 1 file changed, 1 insertion(+)');
    if (sub === 'log') return printLines(s, 'commit 4f2a1c9a8b7d (HEAD -> master)\nAuthor: u0_a1 <u0_a1@localhost>\nDate:   Sat Nov 21 12:00:00 2026 +0000\n\n    demo commit');
    println(s, 'usage: git [--version|init|status|clone <url>|add|commit|log]');
  }, 'git');

  cmd('python', 'python [-c code|--version]', 'Python 3 interpreter (simulated)', pyRun, 'python');
  cmd('python3', 'python3 [-c code|--version]', 'Python 3 interpreter (simulated)', pyRun, 'python');
  cmd('pip', 'pip [list|install <name>]', 'Python package manager (simulated)', pipRun, 'python');
  cmd('pip3', 'pip3 [list|install <name>]', 'Python package manager (simulated)', pipRun, 'python');

  cmd('nmap', 'nmap [-sV] <host>', 'Network scanner (simulated)', (args, s) => {
    if (args.includes('--version')) return println(s, 'Nmap 7.95 ( https://nmap.org )');
    const host = args.find((a) => !a.startsWith('-')) || 'localhost';
    printLines(s,
      'Starting Nmap 7.95 ( https://nmap.org ) at ' + new Date().toISOString() + '\n' +
      'Nmap scan report for ' + host + ' (127.0.0.1)\n' +
      'Host is up (0.00021s latency).\n' +
      'Not shown: 997 closed tcp ports\n' +
      'PORT     STATE SERVICE    VERSION\n' +
      '22/tcp   open  ssh        OpenSSH 9.6\n' +
      '80/tcp   open  http       nginx 1.25\n' +
      '443/tcp  open  https      nginx 1.25\n' +
      'Nmap done: 1 IP address (1 host up) scanned in 0.42 seconds');
    out(s, '<span class="c-gray">(simulated scan — no real network access)</span>');
  }, 'nmap');

  cmd('vim', 'vim [--version|file]', 'Vi IMproved (opens the demo editor)', (args, s) => {
    if (args.includes('--version')) return println(s, 'VIM - Vi IMproved 9.1 (2024 Jan 02)');
    if (!args.length) return printLines(s, 'VIM - Vi IMproved 9.1\nType :q to quit (open a file name to use the demo editor).');
    const path = resolvePath(s, args[0]);
    const { parent, name } = parentOf(path);
    if (!parent || parent.type !== 'dir') return println(s, 'vim: cannot open ' + args[0]);
    const node = parent.children[name];
    if (node && node.type === 'dir') return println(s, 'vim: ' + args[0] + ' is a directory');
    s.deferPrompt = true;
    openEditor(s, args[0], node ? node.content : '', 'vim');
  }, 'vim');

  cmd('wget', 'wget <url>', 'Download a file (simulated)', (args, s) => {
    if (!args.length) return println(s, 'wget: missing URL');
    const url = args[0];
    const host = url.replace(/^https?:\/\//, '').split('/')[0] || 'localhost';
    const name = url.split('/').pop() || 'index.html';
    println(s, '--' + new Date().toISOString() + '--  ' + url);
    println(s, 'Resolving ' + host + '... 127.0.0.1');
    println(s, 'Connecting to ' + host + '|127.0.0.1|:443... connected.');
    println(s, 'HTTP request sent, awaiting response... 200 OK');
    println(s, 'Length: 1024 (1.0K) [text/plain]');
    println(s, 'Saving to: ' + name);
    const path = s.cwd.concat(name);
    const { parent } = parentOf(path);
    if (parent && parent.type === 'dir' && !parent.children[name]) parent.children[name] = file('Downloaded from ' + url + ' (simulated)\n');
    println(s, '1024    100%    1.0K/s    in 0.001s');
    println(s, "'" + name + "' saved [1024/1024]");
  }, 'wget');

  cmd('ssh', 'ssh <host>', 'SSH client (simulated)', (args, s) => {
    if (!args.length || args.includes('--version')) return println(s, 'OpenSSH_9.6p1, OpenSSL 3.0.13');
    println(s, 'Pseudo-terminal will not be allocated because stdin is not a terminal.');
    println(s, 'ssh: connect to host ' + args[0] + ' port 22: Connection refused (simulated)');
  }, 'openssh');

  cmd('scp', 'scp <src> <dest>', 'Secure copy (simulated)', (args, s) => {
    if (args.length < 2) return println(s, 'usage: scp <src> <dest>');
    const src = getNode(resolvePath(s, args[0]));
    if (!src || src.type !== 'file') return println(s, 'scp: ' + args[0] + ': No such file');
    let finalPath = resolvePath(s, args[1]);
    const destNode = getNode(finalPath);
    if (destNode && destNode.type === 'dir') finalPath = finalPath.concat(args[0].split('/').pop());
    const { parent, name } = parentOf(finalPath);
    if (parent && parent.type === 'dir') parent.children[name] = JSON.parse(JSON.stringify(src));
    println(s, args[0] + ' -> ' + args[1] + ' (simulated)');
  }, 'openssh');

  cmd('node', 'node [--version|-e code]', 'Node.js runtime (simulated)', nodeRun, 'nodejs');
  cmd('npm', 'npm [--version|install <name>]', 'Node package manager (simulated)', (args, s) => {
    if (args.includes('--version') || args[0] === '-v') return println(s, '10.8.1');
    if (args[0] === 'install') {
      println(s, 'added 1 package in 0s (simulated)');
      return println(s, '+ ' + (args[1] || 'package') + '@1.0.0');
    }
    println(s, 'Usage: npm <command> [args]');
  }, 'nodejs');

  cmd('rsync', 'rsync <src> <dest>', 'Fast file copying (simulated)', (args, s) => {
    if (args.length < 2) return println(s, 'usage: rsync <src> <dest>');
    printLines(s, 'sending incremental file list\n' + args[0] + '\n\nsent 1.2K bytes  received 35 bytes  (simulated)');
  }, 'rsync');

  cmd('tmux', 'tmux [--version]', 'Terminal multiplexer (simulated)', (args, s) => println(s, 'tmux 3.4'), 'tmux');
  cmd('zsh', 'zsh --version', 'Z shell (simulated)', (args, s) => println(s, 'zsh 5.9 (x86_64-pc-linux-gnu)'), 'zsh');

  cmd('termux-battery-status', 'termux-battery-status', 'Android battery info (simulated)', (args, s) => {
    println(s, JSON.stringify({ health: 'GOOD', percentage: 72, plugged: 'UNPLUGGED', status: 'DISCHARGING', temperature: 31.2 }, null, 2));
  }, 'termux-api');

  // ------------------------------------------------------------------
  // Editor modal
  // ------------------------------------------------------------------
  let editorCtx = null;
  function openEditor(s, displayPath, content, label = 'nano') {
    editorCtx = { s, displayPath };
    $('editorTitle').textContent = label + ' — ' + displayPath;
    $('editorText').value = content;
    $('editorModal').hidden = false;
    $('editorText').focus();
  }
  function closeEditor() {
    $('editorModal').hidden = true;
    const s = editorCtx ? editorCtx.s : activeSession();
    editorCtx = null;
    createPrompt(s);
    scrollBottom();
    s.input.focus();
  }
  function saveEditor() {
    if (!editorCtx) return;
    const { s, displayPath } = editorCtx;
    const path = resolvePath(s, displayPath);
    const { parent, name } = parentOf(path);
    if (parent && parent.type === 'dir') {
      parent.children[name] = file($('editorText').value);
      println(s, 'Wrote ' + displayPath + ' (' + $('editorText').value.length + ' bytes)');
    }
    closeEditor();
    scrollBottom();
  }
  $('editorSave').addEventListener('click', saveEditor);
  $('editorCancel').addEventListener('click', closeEditor);
  $('editorText').addEventListener('keydown', (e) => {
    if (e.ctrlKey && e.key.toLowerCase() === 'o') { e.preventDefault(); saveEditor(); }
    if (e.ctrlKey && e.key.toLowerCase() === 'x') { e.preventDefault(); closeEditor(); }
  });

  // ------------------------------------------------------------------
  // UI wiring
  // ------------------------------------------------------------------
  $('menuBtn').addEventListener('click', openDrawer);
  $('scrim').addEventListener('click', closeDrawer);
  $('newBtn').addEventListener('click', () => { makeSession(); closeDrawer(); });
  $('drawerNew').addEventListener('click', () => { makeSession(); closeDrawer(); });
  $('closeSession').addEventListener('click', () => { closeSession(); closeDrawer(); });

  function tickClock() {
    $('clock').textContent = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false });
  }
  tickClock();
  setInterval(tickClock, 20000);

  makeSession();
})();
