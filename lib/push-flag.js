#!/usr/bin/env node
'use strict';
const fs = require('fs');
const path = require('path');
const os = require('os');
const PUSH_FLAG = path.join(os.tmpdir(), 'ironbark-push-pending');
function setPushFlag() { fs.writeFileSync(PUSH_FLAG, String(Date.now()), 'utf8'); }
module.exports = { setPushFlag, PUSH_FLAG };
if (require.main === module) { setPushFlag(); console.log('[Ironbark] Push flag set'); }
