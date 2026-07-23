-- 014: apuntar las banderas a flagcdn
--
-- FlagsAPI devolvía 500 para gb-eng, gb-wls, gb-sct, gb-nir y xk (solo sirve
-- códigos ISO 3166-1 alpha-2 asignados), y el parche que puso URLs de
-- thumbnails de Wikimedia para las cuatro británicas quedó muerto cuando ese
-- endpoint empezó a devolver 400.
--
-- Desde ahora la app deriva la URL en el cliente a partir del teamId; esta
-- columna se normaliza para que el dato no quede podrido y para que
-- opponent_flag (schema.sql:168) siga devolviendo URLs válidas.

UPDATE teams AS t
SET flag = 'https://flagcdn.com/64x48/' || v.code || '.png'
FROM (VALUES
  ('ger','de'),('fra','fr'),('esp','es'),('ita','it'),('eng','gb-eng'),
  ('ned','nl'),('por','pt'),('bel','be'),('cro','hr'),('den','dk'),
  ('sui','ch'),('aut','at'),('swe','se'),('pol','pl'),('ukr','ua'),
  ('ser','rs'),('tur','tr'),('cze','cz'),('wal','gb-wls'),('sco','gb-sct'),
  ('nor','no'),('rus','ru'),('rou','ro'),('hun','hu'),('gre','gr'),
  ('svk','sk'),('fin','fi'),('bih','ba'),('isl','is'),('ire','ie'),
  ('nir','gb-nir'),('alb','al'),('svn','si'),('mkd','mk'),('bul','bg'),
  ('mne','me'),('isr','il'),('geo','ge'),('arm','am'),('aze','az'),
  ('kaz','kz'),('blr','by'),('lux','lu'),('cyp','cy'),('est','ee'),
  ('lva','lv'),('ltu','lt'),('fro','fo'),('mlt','mt'),('mda','md'),
  ('kos','xk'),('lie','li'),('and','ad'),('smr','sm'),('gib','gi'),
  ('bra','br'),('arg','ar'),('uru','uy'),('col','co'),('chi','cl'),
  ('par','py'),('ecu','ec'),('per','pe'),('ven','ve'),('bol','bo'),
  ('mex','mx'),('usa','us'),('can','ca'),('crc','cr'),('jam','jm'),
  ('pan','pa'),('hon','hn'),('slv','sv'),('tri','tt'),('hti','ht'),
  ('cub','cu'),('gua','gt'),('nic','ni'),('sur','sr'),('brb','bb'),
  ('dom','do'),('ber','bm'),('blz','bz'),('guy','gy'),('pue','pr'),
  ('cuw','cw'),('atg','ag'),('skn','kn'),('lca','lc'),('vin','vc'),
  ('grn','gd'),('msr','ms'),('dma','dm'),('aru','aw'),('cay','ky'),
  ('bah','bs'),('tca','tc'),('vgb','vg'),('vir','vi'),('aia','ai'),
  ('sen','sn'),('mar','ma'),('tun','tn'),('alg','dz'),('egy','eg'),
  ('nga','ng'),('cmr','cm'),('gha','gh'),('civ','ci'),('mli','ml'),
  ('bfa','bf'),('cgo','cd'),('zaf','za'),('gab','ga'),('gui','gn'),
  ('cap','cv'),('uga','ug'),('zam','zm'),('ken','ke'),('mad','mg'),
  ('mau','mr'),('ben','bj'),('nig','ne'),('tog','tg'),('gui-bis','gw'),
  ('rwa','rw'),('bdi','bi'),('eth','et'),('tan','tz'),('zim','zw'),
  ('nam','na'),('moz','mz'),('ang','ao'),('lbr','lr'),('sle','sl'),
  ('mal','mw'),('cgob','cg'),('eqg','gq'),('cta','cf'),('cha','td'),
  ('stp','st'),('gam','gm'),('mri','mu'),('com','km'),('sey','sc'),
  ('dji','dj'),('som','so'),('ssd','ss'),('eri','er'),('les','ls'),
  ('bot','bw'),('swa','sz'),('lby','ly'),('sud','sd'),
  ('jpn','jp'),('kor','kr'),('irn','ir'),('aus','au'),('sau','sa'),
  ('qat','qa'),('uae','ae'),('irq','iq'),('chn','cn'),('uzb','uz'),
  ('tha','th'),('vie','vn'),('omn','om'),('jor','jo'),('bhr','bh'),
  ('syr','sy'),('lbn','lb'),('pal','ps'),('kuw','kw'),('tkm','tm'),
  ('kgz','kg'),('tjk','tj'),('afg','af'),('ind','in'),('mya','mm'),
  ('phi','ph'),('idn','id'),('mas','my'),('sin','sg'),('ban','bd'),
  ('prk','kp'),('hkg','hk'),('yem','ye'),('pak','pk'),('sri','lk'),
  ('mdv','mv'),('nep','np'),('bhu','bt'),('cam','kh'),('lao','la'),
  ('tls','tl'),('bru','bn'),('mac','mo'),('mon','mn'),('tpe','tw'),
  ('gum','gu'),
  ('nzl','nz'),('png','pg'),('fij','fj'),('ncl','nc'),('tah','pf'),
  ('slb','sb'),('van','vu'),('cok','ck'),('sam','ws'),('ton','to')
) AS v(id, code)
WHERE t.id = v.id AND t.flag IS DISTINCT FROM 'https://flagcdn.com/64x48/' || v.code || '.png';
