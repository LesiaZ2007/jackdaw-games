"""
Regenerates packages/games/secret-hitler/src/ui/sho/sho.css from secret-hitler.online's
stylesheets (ShrimpCryptid/Secret-Hitler-Online, frontend/src), in the order the site loads them.

Usage: python -I scope-css.py <Secret-Hitler-Online>/frontend/src src/ui/sho/sho.css
then format it with Prettier (pnpm format).
"""
import re, sys, os
src = sys.argv[1]; out = sys.argv[2]
order = ["index.css","variables.css","App.css","Lobby.css","custom-alert/CustomAlert.css","custom-alert/RoleAlert.css",
 "event-bar/EventBar.css","player/Player.css","selectable.css","player/PlayerDisplay.css",
 "status-bar/StatusBar.css","board/Board.css","custom-alert/VotingPrompt.css","util/PolicyDisplay.css",
 "custom-alert/ElectionTrackerAlert.css","custom-alert/PolicyEnactedAlert.css",
 "custom-alert/InvestigationAlert.css","board/Deck.css","util/PlayerPolicyStatus.css",
 "custom-alert/IconSelection.css"]
P = '.sho'
def strip_comments(t): return re.sub(r'/\*.*?\*/', '', t, flags=re.S)
def blocks(t):
    i=0; n=len(t); res=[]
    while i<n:
        j=t.find('{',i)
        if j<0: break
        head=t[i:j].strip()
        depth=1; k=j+1
        while depth and k<n:
            if t[k]=='{': depth+=1
            elif t[k]=='}': depth-=1
            k+=1
        res.append((head,t[j+1:k-1]))
        i=k
    return res
kf_names=set()
chunks=[]
for f in order:
    t=strip_comments(open(os.path.join(src,f),encoding='utf-8').read())
    t=re.sub(r'@import[^;]*;','',t)
    chunks.append((f,blocks(t)))
for f,bl in chunks:
    for h,b in bl:
        m=re.match(r'@(-webkit-)?keyframes\s+([\w-]+)',h)
        if m: kf_names.add(m.group(2))
def fix_body(b):
    def anim(m):
        prop,val=m.group(1),m.group(2)
        parts=[]
        for seg in val.split(','):
            toks=seg.split()
            toks=['sho-'+x if x in kf_names else x for x in toks]
            parts.append(' '.join(toks))
        return f'{prop}: {", ".join(parts)};'
    b=re.sub(r'((?:-webkit-)?animation(?:-name)?)\s*:\s*([^;]+);',anim,b)
    b=b.replace('--headerFont: Germania One, cursive','--headerFont: var(--ff-sho-header), "Germania One", cursive')
    b=b.replace('--textFont: Montserrat, sans-serif','--textFont: var(--ff-sho-text), Montserrat, sans-serif')
    b=b.replace("font-family: 'Germania One', cursive","font-family: var(--ff-sho-header), 'Germania One', cursive")
    b=b.replace("'Montserrat',","var(--ff-sho-text), 'Montserrat',")
    lines=[l.strip() for l in b.strip().split('\n') if l.strip()]
    return '\n'.join('  '+l for l in lines)
KEEP = ':not(:where(.jd-lchat, .jd-lchat *, .sho-jackdaw, .sho-jackdaw *))'
def scope(sel):
    out=[]
    for s in sel.split(','):
        s=' '.join(s.split())
        if s in (':root','html','body'): out.append(P); continue
        if '::' in s:
            i=s.index('::'); s=s[:i]+KEEP+s[i:]
        else:
            s=s+KEEP
        out.append(f'{P} {s}')
    # dedupe
    seen=[]; [seen.append(x) for x in out if x not in seen]
    return ',\n'.join(seen)
res=['/*\n * secret-hitler.online\'s stylesheet, copied rule for rule in its original order, with every\n * selector scoped under .sho and every animation renamed sho-*, so none of it reaches the rest\n * of Jackdaw. Generated from ShrimpCryptid/Secret-Hitler-Online (frontend/src, CC BY-NC-SA 4.0).\n */\n']
res.append('''/*
 * The site was built on the browser's own defaults (paragraph margins, inline images, a white
 * text box, content-box sizing). Jackdaw's reset (Tailwind's preflight and globals.css) removes
 * them, so inside .sho every element goes back to the browser's default first. :where() keeps
 * this at the weakest specificity, so every rule below still wins.
 *
 * Jackdaw's own pieces inside these pages (table talk, and anything in .sho-jackdaw, such as the
 * TV's join panel) are left out of every rule here, so they keep Jackdaw's look.
 */
.sho :where(*:not(.jd-lchat, .jd-lchat *, .sho-jackdaw, .sho-jackdaw *)) {
  all: revert;
}
''')
done_kf=set()
for f,bl in chunks:
    res.append(f'/* {f} */')
    for h,b in bl:
        m=re.match(r'@(-webkit-)?keyframes\s+([\w-]+)',h)
        if m:
            key=(m.group(1),m.group(2))
            name=f'@{m.group(1) or ""}keyframes sho-{m.group(2)}'
            inner=blocks(b)
            body='\n'.join(f'  {ih} {{ {" ".join(x.strip() for x in ib.strip().split(chr(10)) if x.strip())} }}' for ih,ib in inner)
            res.append(f'{name} {{\n{body}\n}}\n')
            continue
        res.append(f'{scope(h)} {{\n{fix_body(b)}\n}}\n')
open(out,'w',encoding='utf-8').write('\n'.join(res))
print(sorted(kf_names))
