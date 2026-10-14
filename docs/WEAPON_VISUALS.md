# Correção da mira, materiais e efeitos da MP5

A versão anterior usava uma cruz branca com linhas e octaedros amarelos para
flash, impacto e traçante. Esses elementos eram provisórios e não reproduziam
os assets do original. O PNG da MP5 já era o correto, mas faltava sua cor de
material e o render DIFFUSE também alterava a aparência pela iluminação.

## Pipeline de todo o mundo

Por solicitação do usuário, cenário, Mike, MP5 e meshes de inimigos/fallbacks
agora usam `Model3D.UNLIT`, o caminho sem luz da API atual que corresponde à
intenção de `PL_NO_LIGHTS`. Isso foi aplicado em `game.js`,
`player_animations.js`, `player_shots.js`, no preview `scene_import_test.js`
e na galeria `main.js`. Não foi introduzida uma constante antiga que não existe
na API atual. A classe Lights do gameplay carrega apenas o fog de distância.

O shader nativo retorna diretamente para materiais UNLIT em
`render3d_shade.c`; não aplica luz ambiente ou direcional. Scene3D/GLTF3D e
skinning nativo continuam sendo utilizados.

## Texturas e materiais

Os GLBs do Mike e da MP5 agora preservam `baseColorFactor = [0.588, 0.588,
0.588, 1]`, extraído de `_Color` dos materiais Unity. Antes esse fator era
omitido. Os PNGs embutidos e as UVs não foram substituídos; os testes verificam
os bytes originais e a conversão de V. Isso corrige o dado de material, sem
afirmar equivalência entre todos os shaders/gamma/iluminação Unity e GS.

`tools/export_weapon_visuals.py` resolve os GUIDs dos acessórios do wrapper
MP5 e os materiais/shaders de cada emitter. Os assets exportados ficam em
`AthenaModels/WeaponFX/`, com hashes das fontes em `visuals.json`.

| Elemento | Referência original utilizada |
|---|---|
| Mira de rifle | `PlayerController.ResetSightTexture()` escolhe `zhunxin-1`, não o `zhunxin-2` estático no prefab. |
| Pixels da mira | `SceneBase.prefab`, GameUI@2x, rect `(1017, 2, 4, 16)`. Recorte RGBA exato, tamanho lógico TUI 2×8. |
| Cor sem lock | `(0, 0.87058824, 0.88235295, 0.68235296)`, no SightBeadScript do SceneBase. Acertar uma parede não muda a mira para amarelo. |
| Cor com lock | Vermelha do mesmo prefab; disponível no estado de mira. Sem inimigos, lock permanece desativado. |
| Flash | `Mp5RifleSpark.prefab`: mp5_01, AK47_02 e AK47_03; imagens mp05_01.png e AK47_02.png. |
| Impacto padrão | `HitSpark.prefab`: cinco layers, imagens floor_01, hand gun_01, xm1014_attack_02 e floor_05. |
| Traçante | `FireLine.prefab`, materiais bullet_01/bullet_02. Deslocamento a 300 unidades/s; pool de cinco traçantes. |
| Composição | Shaders AB_COL_DO usam alpha normal; AA_COL_DO usam adição. O tint de cada material e o multiplicador por dois são preservados nos sprites de partículas. |

O atlas de efeitos tem 512×512 texels, PNG indexado com 256 cores RGBA.
Mantém as dimensões das texturas de origem, sem redimensionar sprites; uma
imagem é girada no atlas e compensada no desenho. A paletização altera
alguns valores de cor/alpha e é uma adaptação de VRAM. A mira fica em um
PNG RGBA separado, sem paletização, para preservar exatamente seu recorte.

## Comportamento da mira

`PlayerSight` reproduz os valores e a ordem de `SightBeadScript` e
`AssaultRifleController.Fire()`:

1. Distância base dos quatro segmentos: 10 unidades TUI.
2. Expansão de repouso 1 parada / 5 correndo, máximo 20 no nível 1 da MP5.
3. Antes de cada tiro, amostra um disco uniforme de raio
   `abs(expansão atual - repouso) × altura da tela / 320`.
4. Depois da amostragem, acrescenta recoil 10 e limita ao máximo.
5. Recupera em direção ao repouso a 30 unidades/s.

O raycast usa o ponto sorteado, e não sempre o centro da tela. A segunda
consulta desde a boca da arma verifica apenas os 2,5 m próximos de cobertura;
o primeiro raio já resolve o cenário distante. Isso mantém a proteção de
ombro e evita testar duas vezes todos os triângulos até o impacto.

## Adaptação das partículas para PS2

São utilizadas texturas, tints, durações, curvas cúbicas de tamanho, gradientes
de alpha e a seleção aleatória de uma das três linhas de AK47_02 do original.
Ignorar esse flipbook faria aparecer as três chamas empilhadas de uma vez.

Os sprites são projetados pela Camera3D e desenhados/rotacionados pela Image
nativa com alpha/add do GS. As curvas são pré-calculadas em 128 amostras por
layer e interpoladas no frame. Não são carregadas texturas durante os tiros.

A simulação direta de todos os bursts originais excedeu o orçamento da EE:
o profiler mediu ~43 ms/frame só preparando efeitos, com mais de cem
partículas ativas. O port usa **16 partículas no pool e uma por layer em cada
disparo**, mantendo os três layers do flash e os cinco do impacto. A densidade
e algumas trajetórias são, portanto, adaptações; não é uma reprodução completa
do ParticleSystem Unity. O traçante usa pool de cinco e vida máxima de 1 s,
conforme a inicialização de FireLinePool no original.

Limites restantes: os sprites projetados não consultam o z-buffer 3D por pixel;
os raycasts colocam os impactos em superfícies visíveis, mas partículas que
se deslocam podem ter diferenças de oclusão. Auto-lock, estojos e efeitos
específicos metal/madeira ainda não foram implementados.
As fontes e o atlas suportam a MP5 atual, não todas as armas futuras.

## Reproduzir verificações

```sh
python3 tools/export_unity_player_animations.py
python3 tools/export_player_weapon.py
python3 tools/export_weapon_visuals.py
python3 -m unittest tools.test_export_unity_player_animations tools.test_export_player_weapon tools.test_export_weapon_visuals
node tools/test_weapon_visuals.mjs
node tools/test_player_shots.mjs
```

O exportador de sprites usa Pillow, já disponível no ambiente. Os testes
conferem o recorte original, materiais, dimensões e paleta, referências dos
layers, curvas, flipbook, expansão/recuperação/dispersão e a consulta de
cobertura. A validação gráfica usa o ELF `comz_navcoll.elf` no PCSX2; PS2 real
permanece pendente.

Validação final: **58,49 FPS** em 1.530 frames medidos, **167 KiB livres de
VRAM**, zero upload na amostra final, 173 disparos com impactos, recarga
manual/automática e reset aprovados. O ELF confirmou o atlas em 8 bpp e a
expansão da mira durante fogo contínuo. Passaram 14 testes Python, os testes
JS de arma/animação/visuais/tiro, três de navegação e 11 regressões OBJ.

[Resultados e hashes](benchmarks/weapon_visuals_2026-10-13/results.json),
[captura final](benchmarks/weapon_visuals_2026-10-13/preview.png) e
[marcadores](benchmarks/weapon_visuals_2026-10-13/markers.log).
O snapshot `runtime_test.js` deve ser copiado para a raiz de um perfil de
teste com seus módulos/assets; ele contém input simulado, não o gamepad real.
