// Comprehensive authoritative list of banned executable, script, archive, and system extensions.
// Note: Markup/text files (.html, .htm, .css, .json, .xml, .md, .txt) are permitted as generic text files
// because they are rendered strictly escaped with escapeHtml() inside syntax-highlighted code blocks
// and never executed. Executable scripts (.js, .ts, .py, .sh, .php, etc.) remain strictly banned.
export const BANNED_EXTENSIONS_LIST = [
  'exe', 'bat', 'cmd', 'sh', 'bash', 'zsh', 'ps1', 'psm1', 'vbs', 'vbe',
  'js', 'mjs', 'cjs', 'ts', 'jsx', 'tsx', 'php', 'phtml', 'php3', 'php4', 'php5', 'phps',
  'py', 'pyc', 'pyd', 'pyo', 'pyw', 'rb', 'pl', 'cgi', 'jar', 'war', 'ear',
  'apk', 'aab', 'msi', 'msp', 'mst', 'com', 'gadget', 'wsf', 'wsh', 'scr',
  'hta', 'cpl', 'msc', 'inf', 'reg', 'dll', 'so', 'dylib', 'bin', 'elf',
  'iso'
] as const;

export const BANNED_EXTENSIONS = new Set<string>(BANNED_EXTENSIONS_LIST);
