// Comprehensive authoritative list of banned executable, script, archive, and system extensions
export const BANNED_EXTENSIONS_LIST = [
  'exe', 'bat', 'cmd', 'sh', 'bash', 'zsh', 'ps1', 'psm1', 'vbs', 'vbe',
  'js', 'mjs', 'cjs', 'ts', 'jsx', 'tsx', 'php', 'phtml', 'php3', 'php4', 'php5', 'phps',
  'py', 'pyc', 'pyd', 'pyo', 'pyw', 'rb', 'pl', 'cgi', 'jar', 'war', 'ear',
  'apk', 'aab', 'msi', 'msp', 'mst', 'com', 'gadget', 'wsf', 'wsh', 'scr',
  'hta', 'cpl', 'msc', 'inf', 'reg', 'dll', 'so', 'dylib', 'bin', 'elf',
  'html', 'htm', 'iso'
] as const;

export const BANNED_EXTENSIONS = new Set<string>(BANNED_EXTENSIONS_LIST);
