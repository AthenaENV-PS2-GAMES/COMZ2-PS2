# Animações originais do Mike no AthenaENV

As animações podem ser extraídas dos assets já presentes no projeto.
`AthenaModels/mike_animated.glb` contém o rig, quatro partes skinned,
dois atlas PNG originais e doze clips. `game.js` agora usa esse modelo e
mantém os zumbis desativados, sem carregar sua malha ou textura.
O teste não termina ao completar os 90 segundos do protótipo de sobrevivência.
Na etapa seguinte, a MP5 equipada e o tiro real no cenário foram integrados;
ver [mecânicas do player](PLAYER_MECHANICS.md) para os estados de arma/munição.

## Conteúdo convertido

O prefab `Assets/Resources/prefabs/avatar/Mike_1.prefab` referencia, pelo GUID,
`Assets/PrefabInstance/Mike_1_0.prefab`. Seu componente Animation registra
94 clips legados. Os scripts originais PlayerController e
AssaultRifleController indicam os clips usados no movimento e com a MP5.
A conversão atual inclui:

| Função | Clip original |
|---|---|
| Pernas em idle | MP5_LowerBody_Idle01 |
| Corrida para frente/trás | Lower_body_Run01 / Lower_body_Run02 |
| Corrida esquerda/direita | Lower_body_Run03 / Lower_body_Run04 |
| Pernas ao disparar parado | MP5_LowerBody_Shooting01 |
| Tronco em idle/corrida | MP5_UpperBody_Idle01 / MP5_UpperBody_Run01 |
| Tronco ao disparar/recarregar | MP5_UpperBody_Shooting01 / MP5_UpperBody_Reload01 |
| Preparação / pernas na recarga | MP5_UpperBody_FireReady / MP5_LowerBody_Reload01 |

O GLB atual tem 733.352 bytes, 35 nós, 480 vértices fonte e 498 triângulos.
As partes Head/Body/Neck/01 usam 11/19/9/4 joints por skin, respectivamente,
com até três influências por vértice. Cada paleta cabe no limite de 24 joints
do caminho de skinning VU1 do renderer; elegibilidade também depende dos
bounds e da câmera. O caminho com clipping pode usar a CPU.

Os meshes e materiais vêm das referências **do prefab**, incluindo as
variantes `Avatar_Mike_H_*_2.asset`, e não de uma associação por nome a outros
meshes semelhantes. Os atlas são Avatar_Mike_A.png e Avatar_Mike_A_01.png.
O manifesto `AthenaModels/mike_animated.json` registra fontes, hashes,
durações, tracks e alterações de máscara.

## Formato e reprodução

OBJ guarda apenas geometria estática. GLB transporta JOINTS_0, WEIGHTS_0,
inverseBindMatrices, a hierarquia e os canais de animação que GLTF3D.load()
entrega como clips Animation3D. A conversão reflete X para a convenção glTF,
inverte o winding dos triângulos e faz V=1-V nas UVs. Transforms, quaternions,
tangentes e matrizes de bind recebem a mesma mudança de base. Não aplicar
novamente a rotação -90° usada nos OBJ estáticos: o rig já posiciona a
geometria local corretamente.

As curvas Hermite e suas tangentes são exportadas como CUBICSPLINE. Os
quaternions são normalizados; os pesos são normalizados sem remover
influências. Os PNGs são embutidos byte a byte, sem nova quantização.
O conversor é específico para os assets Unity de texto deste projeto;
não é um importador genérico de FBX, Mecanim ou curvas comprimidas.

O código Unity aplica AddMixingTransform ao transform Spine_00 para a camada
de tronco. Alguns clips superiores também possuem canais Bip01 que seriam
ignorados por essa máscara. O conversor aplica a mesma máscara, removendo
esses canais de raiz; isso evita dois players sobrescrevendo o mesmo osso.
Cada clip mantém TRS completo para seus alvos; se faltar um canal, a
ferramenta acrescenta uma constante da pose do prefab, registrada no manifesto.

`player_animations.js` usa dois Animation3D.Player ativos, um para pernas e
outro para tronco. A amostragem ocorre em C via Animation3D.attachLoop(),
uma vez por frame. Corrida continua nas pernas durante o disparo do tronco.
O estado de arma controla preparação, disparo, pós-tiro e recarga; Start restaura
a pose. A raiz externa recebe a posição da cápsula de Collision3D e o yaw
do jogador. As animações não dirigem a posição física da cápsula.

A cena de câmera permanece referenciada pelos callbacks do jogo, evitando
que seu finalizer desconecte as atualizações nativas. A equivalência entre
Follow e a fórmula anterior da câmera foi verificada em diferentes ângulos,
com erro máximo de matriz de aproximadamente 4,77e-7.

## Gerar e testar novamente

Na raiz do projeto:

```sh
python3 tools/export_unity_player_animations.py
python3 -m unittest tools.test_export_unity_player_animations
```

O conversor usa a biblioteca padrão Python e as rotinas existentes de leitura
de mesh, sem instalar Blender, Unity, NumPy ou PyYAML. As fontes Unity
permanecem intactas. Para jogar o teste, iniciar `comz_navcoll.elf` com o
`athena.ini` atual (`default_script=game.js`). Módulos necessários incluem
GLTF3D, Animation3D, Scene3D, CameraRig3D, LOD, Font, TileMap e Collision3D.

- Analógico esquerdo: mover e selecionar a direção da corrida.
- Analógico direito: câmera/mira.
- X ou R1: disparo automático, com consumo de munição.
- Quadrado: recarga quando há reserva e espaço no carregador.
- Start: reset do jogador e das poses.

## Evidência e limites

Os testes conferem geometria/UVs convertidas, identidade dos PNGs embutidos,
índices de joints, pesos, curvas e hierarquia. Uma avaliação independente de
skinning compara as matrizes originais Unity com as matrizes serializadas
no GLB em pose de referência, com tolerância 1e-5. As máscaras de tronco e
pernas foram verificadas como disjuntas. Passaram três testes específicos
de conversão, doze testes Python do projeto e onze regressões OBJ da skill.

Na validação inicial de dez clips (anterior à integração da arma), o ELF real
carregou e reproduziu os clips no PCSX2 2.8.2. Um preview isolado
percorreu sete combinações de clips em 630 frames, renderizando os quatro
meshes e 498 triângulos sem clipping C na amostra final, a aproximadamente
60 FPS. A versão integrada percorreu movimento nas quatro direções, disparo,
recarga, retorno ao idle e reset. Medição de 510 frames: 59,94 FPS, 700.416
bytes livres de VRAM (684 KiB), upload zero na amostra final e zero zumbis.
Foi uma execução, sem certificação de hardware real ou de todas as câmeras.

A troca de clips ainda é direta: não foi reproduzido o crossfade/mixer do
Unity. A geometria da MP5 e efeitos simples já foram integrados na etapa de
[mecânicas](PLAYER_MECHANICS.md); eventos originais e ajustes procedurais de
mira do tronco/cabeça continuam pendentes.

[Resultados e hashes](benchmarks/player_animations_2026-10-13/results.json)
e [captura no mapa](benchmarks/player_animations_2026-10-13/preview.png).
O snapshot `runtime_test.js` nessa pasta foi executado na raiz do perfil
isolado, junto aos módulos/assets; não deve ser iniciado diretamente de
dentro da pasta de documentação.
