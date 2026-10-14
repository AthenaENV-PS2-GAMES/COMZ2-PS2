# Otimizações com comz.elf — 2026-10-13

O preview agora utiliza LOD, CameraRig3D, Profiler, Font e TileMap do novo
`comz.elf`. Os bindings dos cinco módulos foram confirmados nos símbolos
do ELF e suas APIs conferidas em `athena.d.ts`.

O cenário inicial continua em 59,94 FPS. O ganho principal desta rodada é
folga de CPU: HUD de 4,53 para aproximadamente 0,10 ms, e submissão do
cenário de 9,01 para 8,37 ms. Os testes anteriores já atingiam o limite de
apresentação de 60 FPS. Os números são médias das cinco últimas janelas de
60 frames, usando o mesmo novo ELF nos dois lados da comparação.

| Versão | FPS | Cenário, ms | HUD, ms | VRAM livre, KiB |
|---|---:|---:|---:|---:|
| Código anterior com comz.elf | 59,94 | 9,01 | 4,53 | 493 |
| Scene3D, LOD, câmera e HUD nativos | 59,94 | 8,37 | 0,10 | 428 |
| Versão nativa com LOD desativado | 59,94 | 8,39 | 0,10 | 428 |

## O que mudou

`scene_import_test.js` carrega os chunks como nós Scene3D agrupados por
célula, com bounds de subárvores e fila nativa ordenada por pipeline.
`scene.attachLoop()` atualiza somente transforms/bounds sujos; os três
personagens estáticos ficam em uma segunda Scene3D. Os três atlas do mapa
continuam compartilhados e os materiais continuam DIFFUSE.

LOD.Group faz descarte por distância em C, com um nível de geometria e
histerese de 8%. Os chunks foram recentrados, e `position` no manifesto
recoloca cada nó em sua posição mundial. Isso evita calcular a distância de
todas as regiões como se estivessem na origem. O limite de cada grupo é
`drawDistance + raio do chunk`, para não descartar um chunk grande apenas
porque seu centro ficou distante. O padrão é 45 unidades, com fog preto
entre 33,75 e 45 de profundidade de câmera. Essa escolha altera a visibilidade
distante; ajustar `PROFILE.drawDistance` ou usar `PROFILE.lod=false` para
comparar com a cena inteira sem fog. Não foram criadas malhas simplificadas.

Os handles LOD ficam retidos nos callbacks do loop. Sem essa referência,
o coletor pode liberar os grupos após a execução da configuração inicial.
`lodGroupCount` e `LOD.stats()` permitem confirmar que os grupos continuam
ativos. A grade nativa de LOD usa células de 24 unidades e capacidade 128.
Na câmera inicial há 268 grupos, 61 ocultos por distância e 207 no nível 0.
Os objetos distantes já eram descartados pelo frustum nessa câmera, por isso
o ganho adicional do LOD aí é pequeno. Em posições diferentes, o descarte
por distância e a grade evitam avaliações/submissões de regiões remotas.

CameraRig3D.Orbit executa trigonometria, posicionamento e look-at em C,
integrado ao POST_UPDATE do Loop. JavaScript envia apenas deltas de controle.
A convenção de yaw foi convertida para preservar a posição inicial e a
direção dos controles. A entrada só é aceita com pad conectado e em modo
analógico, evitando o deslocamento causado pela inicialização dos sticks.

`native_hud.js` mantém os rótulos fixos em um único buffer de sprites do
TileMap e usa Font.render() para as duas linhas variáveis. O layout de texto
é recriado somente quando o conteúdo muda; as linhas de diagnóstico mudam
uma vez a cada 60 frames. Os glyphs TrueType de tamanho 14 são pré-carregados
durante a configuração. O custo em VRAM da fonte foi 66.560 bytes (65 KiB):
VRAM livre de 504.832 para 438.272 bytes. Os uploads após aquecimento
continuaram em zero. Não houve quantização adicional de texturas nesta rodada.

Profiler coleta scopes `input`, `scene`, `actors` e `hud`, com média, p95
e pico. `attachRender3D()` registra os contadores 3D, e `auto()` fecha cada
frame. A leitura explícita de `frameStats` usa `reset=false`: só o Profiler
consome/reset os totais. Logs compactos são o padrão; `PROFILE.verbose=true`
inclui todos os campos dos scopes, mas aumenta o custo do frame de relatório.
O overlay Debug não é ativado durante os benchmarks.

## Regeneração e validação

Depois de regenerar os atlas ou os OBJs, regenerar os chunks **com recentramento**:

```sh
python3 tools/split_scene_chunks.py \
  --output PS2Assets/SceneImports/COM2_NORMAL_1/Packed/Chunks --centered
```

O `bounds` do manifesto continua mundial; `position` registra a origem do
nó e os vértices do OBJ são locais. O formato sem `--centered` permanece
disponível e usa position zero, mas reduz a utilidade do LOD por distância.
OBJ/UVs/normais/alpha foram conferidos após recolocar os nós: 9.908
triângulos preservados, erro máximo de coordenadas de aproximadamente
`5e-8` unidade, UVs e normais idênticos, três caminhos de textura compartilhados.

Foram executados cinco testes Python, verificação sintática dos dois arquivos
JS e quatro variantes finais no PCSX2 2.8.2, cada uma com 30 frames de
aquecimento e 360 frames medidos. Houve uma execução por variante. Nenhum
erro do Profiler ou upload recorrente foi registrado. A primeira janela é
excluída das médias de custo por causa do reset e da troca inicial do texto.

O teste de deslocamento moveu o centro da câmera de `(0,1,6)` para `(60,1,6)`
e depois retornou. Os grupos permaneceram vivos e atualizados: 61 chunks
ocultos no início, 63 na região distante, com cinco células da grade puladas,
e 44 ocultos após retornar. A diferença após o retorno é esperada pela
histerese. O custo do cenário na região distante ficou aproximadamente
5,96 ms; os frames de transição ficaram próximos de 60 FPS.

Os testes desta auditoria verificavam o preview estático no PCSX2. Depois,
`game.js` passou a carregar os mesmos 268 chunks no modo survival, mantendo
as ondas e os atores existentes. O ELF `comz.elf` iniciou o script sem erro e
renderizou a cena e os inimigos a 60 FPS no PCSX2; a HUD mostra chunks, VRAM
livre e regiões ocultas pelo LOD. Inimigos e personagem ainda usam modelos
estáticos; colisão de cenário e execução em hardware real permanecem pendentes.
A galeria `main.js` continua independente.

[Resultados e hashes](benchmarks/native_modules_2026-10-13/results.json)
e [captura do preview](benchmarks/native_modules_2026-10-13/preview.png).
O relatório anterior, [SCENE_PERFORMANCE.md](SCENE_PERFORMANCE.md), documenta
o ELF antigo e a divisão espacial que resolveu o gargalo de 10 FPS.
