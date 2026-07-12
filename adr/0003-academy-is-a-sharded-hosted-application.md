# Academy is a sharded hosted application

Academy builds as a separate `/academy/` application whose shell and current content are loaded independently from the size-limited userscript. It reuses Reader learning Modules through narrow adapters, while large curriculum, art, audio, and private source media remain versioned shards rather than inflating or forking `dist/yomu.user.js`.
