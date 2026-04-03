#!/usr/bin/env bash
set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
CLAUDE_DIR="$HOME/.claude"
IRONBARK_DIR="$CLAUDE_DIR/ironbark"
REPO_DIR="$CLAUDE_DIR/ironbark-repo"
REPO_URL="https://github.com/chatgptnotes/ironbark.git"

echo "========================================"
echo "  Ironbark — Learning Loop for Claude Code"
echo "  with Community Sync (chatgptnotes/ironbark)"
echo "========================================"
echo ""

echo "[1/7] Creating directories..."
mkdir -p "$CLAUDE_DIR/commands" "$CLAUDE_DIR/skills/ironbark" "$CLAUDE_DIR/skills/harvested"
mkdir -p "$IRONBARK_DIR/hooks" "$IRONBARK_DIR/lib"

echo "[2/7] Installing /ironbark command..."
cp "$SCRIPT_DIR/commands/ironbark.md" "$CLAUDE_DIR/commands/ironbark.md"

echo "[3/7] Installing ironbark skill..."
cp "$SCRIPT_DIR/skills/ironbark/SKILL.md" "$CLAUDE_DIR/skills/ironbark/SKILL.md"

echo "[4/7] Installing hooks and libraries..."
for f in auto-claude-md.js ironbark-auto.js ironbark-sync-pull.js ironbark-sync-push.js; do
  [ -f "$SCRIPT_DIR/hooks/$f" ] && cp "$SCRIPT_DIR/hooks/$f" "$IRONBARK_DIR/hooks/$f"
done
for f in utils.js project-detect.js sync.js push-flag.js; do
  [ -f "$SCRIPT_DIR/lib/$f" ] && cp "$SCRIPT_DIR/lib/$f" "$IRONBARK_DIR/lib/$f"
done

echo "[5/7] Setting up community repo sync..."
if [ -d "$REPO_DIR/.git" ]; then
  echo "  Repo exists — pulling latest..."
  cd "$REPO_DIR" && git pull --ff-only 2>/dev/null || echo "  Pull skipped"
  cd "$SCRIPT_DIR"
else
  echo "  Cloning chatgptnotes/ironbark..."
  git clone "$REPO_URL" "$REPO_DIR" 2>/dev/null || echo "  Clone failed — will retry on session start"
fi

if [ -d "$REPO_DIR/harvested" ]; then
  SKILL_COUNT=0
  for skill_dir in "$REPO_DIR/harvested"/*/; do
    [ -d "$skill_dir" ] || continue
    skill_name=$(basename "$skill_dir")
    [ "$skill_name" = ".gitkeep" ] && continue
    if [ -f "$skill_dir/SKILL.md" ]; then
      mkdir -p "$CLAUDE_DIR/skills/harvested/$skill_name"
      cp "$skill_dir/SKILL.md" "$CLAUDE_DIR/skills/harvested/$skill_name/SKILL.md"
      SKILL_COUNT=$((SKILL_COUNT + 1))
    fi
  done
  echo "  Synced $SKILL_COUNT community skill(s)"
fi

echo "[6/7] Registering hooks..."
SETTINGS_FILE="$CLAUDE_DIR/settings.json"
if [[ "$OSTYPE" == "msys" || "$OSTYPE" == "cygwin" || "$OS" == "Windows_NT" ]]; then
  HOOK_BASE="$(cygpath -m "$IRONBARK_DIR" 2>/dev/null || echo "$IRONBARK_DIR" | sed 's|\|/|g')"
else
  HOOK_BASE="$IRONBARK_DIR"
fi
[ ! -f "$SETTINGS_FILE" ] && echo '{}' > "$SETTINGS_FILE"

node -e "
const fs=require('fs'),p='$SETTINGS_FILE',h='$HOOK_BASE';
let s; try{s=JSON.parse(fs.readFileSync(p,'utf8'))}catch{s={}}
if(!s.hooks)s.hooks={};
['SessionStart','Stop','PreToolUse'].forEach(k=>{
  if(!s.hooks[k])s.hooks[k]=[];
  s.hooks[k]=s.hooks[k].filter(x=>!(x.description&&x.description.includes('Ironbark')));
});
s.hooks.SessionStart.push({matcher:'*',hooks:[{type:'command',command:'node \"'+h+'/hooks/auto-claude-md.js\"'}],description:'Ironbark: Auto-bootstrap CLAUDE.md'});
s.hooks.SessionStart.push({matcher:'*',hooks:[{type:'command',command:'node \"'+h+'/hooks/ironbark-sync-pull.js\"',timeout:30}],description:'Ironbark: Pull community skills from chatgptnotes/ironbark'});
s.hooks.Stop.push({matcher:'*',hooks:[{type:'command',command:'node \"'+h+'/hooks/ironbark-auto.js\"',async:true,timeout:10}],description:'Ironbark: Nudge after complex sessions'});
s.hooks.Stop.push({matcher:'*',hooks:[{type:'command',command:'node \"'+h+'/hooks/ironbark-sync-push.js\"',async:true,timeout:30}],description:'Ironbark: Auto-push skills to chatgptnotes/ironbark'});
s.hooks.PreToolUse.push({matcher:'Write|Edit',hooks:[{type:'command',command:'node \"'+h+'/hooks/ironbark-sync-pull.js\"',async:true,timeout:15}],description:'Ironbark: Mid-session skill sync (stale >30min)'});
fs.writeFileSync(p,JSON.stringify(s,null,2)+'\n');
console.log('  Hooks registered.');
"

echo "[7/7] Done!"
echo ""
echo "========================================"
echo "  Ironbark installed!"
echo "========================================"
echo ""
echo "  /ironbark         — harvest skills from session"
echo "  Auto-pull         — community skills on session start"
echo "  Auto-push         — new skills after /ironbark harvest"
echo "  Mid-session sync  — pulls if stale >30min"
echo "  Repo              — github.com/chatgptnotes/ironbark"
echo ""
echo "To uninstall: bash uninstall.sh"
