const { spawnSync } = require('child_process');

function resolveTmuxConfig(options = {}) {
  const session = options.session || process.env.TMUX_SESSION || process.env.PET_TMUX_SESSION || '';
  const target = options.target || process.env.TMUX_TARGET || process.env.PET_TMUX_TARGET || '';
  const wslDistro = options.wslDistro || process.env.WSL_DISTRO || 'Ubuntu';

  let viaWsl = options.viaWsl;
  if (viaWsl === undefined) {
    if (process.env.PET_TMUX_VIA_WSL === '1') viaWsl = true;
    else if (process.env.PET_TMUX_VIA_WSL === '0') viaWsl = false;
    else viaWsl = process.platform === 'win32';
  }

  return { session, target, viaWsl, wslDistro };
}

function runTmuxSendKeys(text, config) {
  const target = config.target ? `${config.session}:${config.target}` : config.session;
  const sendEnter = config.sendEnter !== false;
  // 先贴文本，再单独发 C-m（回车），两步比一步内嵌 \n 更可靠
  const tmuxArgs = ['send-keys', '-t', target, text];
  const result = runTmux(target, tmuxArgs, config);
  if (sendEnter && result.ok) {
    return runTmux(target, ['send-keys', '-t', target, 'C-m'], config);
  }
  return result;
}

function runTmux(target, tmuxArgs, config) {
  if (config.viaWsl) {
    const r = spawnSync('wsl', ['-d', config.wslDistro, '--', 'tmux', ...tmuxArgs], {
      encoding: 'utf8',
      windowsHide: true
    });
    return r.status === 0 ? { ok: true } : { ok: false, reason: (r.stderr || r.stdout || 'tmux_failed').trim() };
  }
  const r = spawnSync('tmux', tmuxArgs, { encoding: 'utf8', windowsHide: true });
  return r.status === 0 ? { ok: true } : { ok: false, reason: (r.stderr || r.stdout || 'tmux_failed').trim() };
}

function injectToTmux(text, options = {}) {
  const config = resolveTmuxConfig(options);

  if (!config.session) {
    return { ok: false, reason: 'no_tmux_session' };
  }

  const result = runTmuxSendKeys(text, config);
  if (result.ok) {
    return { ok: true, viaWsl: config.viaWsl, session: config.session };
  }
  return result;
}

function describeTmuxBackend() {
  const config = resolveTmuxConfig();
  if (!config.session) return 'disabled (TMUX_SESSION not set)';
  return config.viaWsl
    ? `wsl:${config.wslDistro} session=${config.session}`
    : `native session=${config.session}`;
}

module.exports = {
  injectToTmux,
  resolveTmuxConfig,
  describeTmuxBackend
};
