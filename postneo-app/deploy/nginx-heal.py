# POSTNEO · лечение конфига nginx от прежних вставок установщика.
# 1. Убирает блоки «# POSTNEO short» (в одной версии там было правило для корня «location = /», которое
#    сталкивалось с собственной страницей сервера и ломало конфиг).
# 2. Возвращает только безопасные короткие адреса /calculator и /calculator.html — в те блоки server, где их ещё нет.
# Запуск: python3 nginx-heal.py /etc/nginx/sites-available/postneo-site
import re,sys
f=sys.argv[1];s=open(f).read();orig=s
s=re.sub(r'\n[ \t]*# POSTNEO short:[^\n]*\n(?:[ \t]*location = /[^\n]*\{ return 30[12] [^\n]*\}[ \t]*\n)*','\n',s)
def blocks(text):
    out=[]
    for m in re.finditer(r'^[ \t]*server[ \t]*\{',text,re.M):
        st=m.start();j=text.index('{',st);depth=0
        while j<len(text):
            if text[j]=='{':depth+=1
            elif text[j]=='}':
                depth-=1
                if depth==0:break
            j+=1
        out.append((st,j+1))
    return out
for st,en in reversed(blocks(s)):
    seg=s[st:en]
    if 'postneo' not in seg:continue
    add=[]
    for path in ('/calculator','/calculator.html'):
        if not re.search(r'location[ \t]+=[ \t]*'+re.escape(path)+r'[ \t]*\{',seg):
            add.append(f'    location = {path} {{ return 302 /postneo/calculator.html; }}')
    if add:
        brace=s.index('{',st)+1
        s=s[:brace]+'\n    # POSTNEO calc: короткий адрес калькулятора\n'+'\n'.join(add)+'\n'+s[brace:]
if s!=orig:
    open(f,'w').write(s);print('nginx: конфиг вылечен (короткие адреса без корня)')
else:
    print('nginx: лечить нечего')
