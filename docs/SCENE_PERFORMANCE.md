# Diagnóstico do scene_import_test.js — 2026-10-13

Este relatório registra o ELF antigo. O novo `comz.elf` e a aplicação de
LOD, CameraRig3D, Profiler, Font e TileMap estão documentados em
[NATIVE_MODULE_OPTIMIZATIONS.md](NATIVE_MODULE_OPTIMIZATIONS.md).
Com o HUD nativo a VRAM livre atual é 428 KiB; os 493 KiB abaixo são a
medição histórica sem o atlas da nova fonte.

O gargalo principal era o clipping das três malhas do cenário na CPU EE.
A divisão espacial, com as mesmas texturas e iluminação DIFFUSE, passou de
9,99 para 59,94 FPS na câmera inicial no PCSX2 2.8.2. A VRAM livre continuou
em 504.832 bytes (493 KiB). Não foi preciso substituir o ELF.

As medições estão em [results.json](benchmarks/scene_import_2026-10-13/results.json)
e [profile-lines.txt](benchmarks/scene_import_2026-10-13/profile-lines.txt).

## Evidência e causa

Cada uma das três páginas unia geometria distribuída por quase todo o mapa.
Seus AABBs medem aproximadamente 76 × 13 × 56 unidades; a câmera inicial
fica dentro dos três volumes. Isso impede o descarte de regiões do cenário
por objeto. O renderizador tenta frustum, guard band e clipping do near
plane em VU1; quando o volume não cabe nesses caminhos, chama o clipper C.

No teste das páginas inteiras, `cpuClipObjects=3` e `culledObjects=0`.
O código em `render3d_gs.c:draw_view()` passa as malhas inteiras para
`athena_render3d_clip_mesh_textured()`. O clipper percorre todos os cantos
dos triângulos e também calcula iluminação DIFFUSE na EE. Esse trabalho
consome aproximadamente 80 ms apenas na submissão do cenário.

| Variante, câmera fixa | FPS | Cenário, ms | HUD, ms | VRAM livre, KiB |
|---|---:|---:|---:|---:|
| Três malhas, HUD com objetos por caractere | 9,99 | 80,28 | 15,26 | 493 |
| Três malhas, retângulos do HUD reutilizados | 9,99 | 80,28 | 3,91 | 493 |
| Três malhas UNLIT, HUD reutilizado | 14,99 | 51,60 | 3,90 | 493 |
| Três malhas, sem HUD | 11,99 | 80,28 | 0,01 | 493 |
| 268 regiões, DIFFUSE, batch nativo e HUD reutilizado | 59,94 | 9,02 | 3,96 | 493 |

Reduzir o tempo do HUD não garantiu ganho de FPS sozinho: a apresentação
espera pelo próximo VBlank. UNLIT evidencia o custo da iluminação no caminho
C, mas altera a aparência; a versão final mantém DIFFUSE.

O teste espacial descartou 172 objetos. `sourceTriangles` caiu de 10.934
para 5.160, incluindo os 1.026 triângulos dos personagens. Restaram dez
objetos com clipping C, porém pequenos. O número de objetos com clipping,
sozinho, não mede seu custo: três malhas enormes eram muito mais caras.
`triangles` enviados ao VU1 aumentou de 4.580 para 4.852; mover trabalho da
EE para o VU1 trouxe o ganho mesmo com esse aumento.

As três páginas usam texturas diferentes. Mesmo agrupadas, continuam sendo
três passes de cenário e três dos personagens. Batch não resolve a fusão
espacial sozinho; ele permite desenhar as regiões em C e compartilhar o
pass entre regiões consecutivas com a mesma textura/pipeline.

## VRAM e RAM

`VRAM_UPLOADED` foi zero nas amostras após o aquecimento, tanto no cenário
inteiro quanto no dividido. Não há evidência de thrashing nessa cena.
No controle sem desenhar o cenário, a VRAM livre subiu de 504.832 para
704.512 bytes: as três páginas ocupam exatamente 199.680 bytes (195 KiB),
compatíveis com T8 mais CLUTs. Os PNGs têm 252, 255 e 253 cores RGBA.

O backend 3D torna a textura residente e mantém sua alocação bloqueada.
Dividir em regiões não deve duplicar texturas: a versão final carrega cada
atlas uma vez e o compartilha entre todas as suas regiões. O custo em VRAM
permaneceu idêntico. Atlas originais separados não cabem nesse orçamento.

O HUD anterior dizia 384 KiB CT16 para o cenário e 688 KiB CT16 para tudo.
Isso não descrevia os formatos reais: as páginas são T8, e os PNGs atuais
dos personagens ultrapassam 256 cores e normalmente permanecem CT32.
O HUD foi atualizado para mostrar T8 e a VRAM livre medida.

Para recuperar VRAM adicional, a próxima ação é quantizar os atlas dos
personagens para <=256 cores, preservando alpha e conferindo a aparência.
Esta auditoria não modifica essas imagens. Reduzir resolução/formato dos
framebuffers também pode liberar VRAM, mas exige verificação visual e dos
modos de vídeo. Acrescentar módulos nativos não aumenta a VRAM disponível.

VRAM e RAM da EE são contas distintas. Texturas 3D também mantêm uma cópia
canônica CT32 na RAM, além dos índices para upload quando aplicável. Os três
atlas do cenário mantêm 768 KiB de pixels canônicos na EE, além desses
índices, geometria e estruturas. O ELF tem 14.256.000 bytes no disco, mas
`size` reporta aproximadamente 3,02 MiB em text/data/bss: o tamanho do
arquivo com símbolos de debug não é seu consumo total de RAM em execução.
Não foi medido um perfil completo de RAM nesta rodada.

## Módulos nativos

Presença verificada nos símbolos de bindings de `athena_nilo.elf`, não
deduzida apenas de um README ou das declarações TypeScript.

| Recurso | No ELF? | Aplicação ao port |
|---|---|---|
| Model3D, Render3D, Camera3D, Lights | Sim | Renderização já nativa; VU1 nos caminhos elegíveis. |
| Render3D.Batch | Sim | Aplicado ao preview; um draw JS por batch, culling por malha em C. |
| Scene3D | Sim | Próxima integração ao gameplay: hierarquia por região, dirty transforms, subtree culling e ordenação de pipeline. Não corrige limites enormes sem dividir o conteúdo. |
| Animation3D e GLTF3D | Sim | Animações e skinning nativos para personagens futuros; os atores deste teste são estáticos. |
| LOD | Não | Útil com regiões/props separados e versões simplificadas; distância, histerese e draw distance. |
| CameraRig3D | Não | Órbita/follow nativos; reduz matemática e setters JS por frame. Custo secundário neste preview. |
| Profiler | Não | Scopes e históricos, p95/peak e contadores 3D; prioridade para diagnóstico contínuo. |
| Font e TileMap | Não | Texto em C e sprites em batch VU1 para reduzir chamadas por caractere; considerar no HUD definitivo, usando uma fonte/atlas compatível. |
| Debug3D | Não | Visualizar AABBs/frustum; os timings deste módulo medem seu próprio overlay, não todo o Render3D. |
| MeshBuilder | Não | Construção/merge de geometria; indiscriminadamente unir todo o cenário repetiria o problema. Não é necessário para carregar estes chunks offline. |
| Nav e Collision3D | Não | Crowd/pathfinding e colisões nativas para o gameplay; não aceleram o desenho estático desta amostra. |

Não é necessário portar o jogo inteiro para C para obter o ganho mostrado.
O JavaScript configura conteúdo e chama os batches; o renderer existente
executa culling, clipping e submissão em código nativo.

Se for preparar outro ELF, preservar os módulos atuais e acrescentar
primeiro `profiler`, `lod` e `camerarig3d`. A seleção em
`node tools/modules.js configure --modules=...` substitui a seleção anterior:
usar a lista completa do build e reconstruir o ELF e suas declarações.
O Profiler traz dependências de Loop/Debug. Não instalar todos os módulos
indiscriminadamente nem usar ERL sem necessidade: ambos consomem RAM.

## Alterações e reprodução

`scene_import_test.js` agora usa 268 chunks em células de 8 unidades, batch
nativo, três atlas compartilhados, retângulos de HUD reutilizados,
transforms estáticos inicializados uma vez e atualização de câmera apenas
quando há entrada. A iluminação DIFFUSE e o alpha cutoff de 0,1 da página
1 continuam aplicados. Logs `SCENE_PROFILE` mostram médias a cada 60 frames.

Regenerar os chunks depois de alterar ou regenerar os atlas/OBJs:

```sh
python3 tools/split_scene_chunks.py \
  --output PS2Assets/SceneImports/COM2_NORMAL_1/Packed/Chunks
```

A ferramenta atribui cada triângulo à célula de seu centroide, sem cortar
ou remover faces. Os limites reais da malha incluem as faces que atravessam
células; por isso o descarte permanece conservador. Foram comparados os
multisets de todos os 9.908 triângulos orientados, UVs e normais com os
originais, com arredondamento a sete casas decimais, além do alpha cutoff
e dos caminhos das três texturas compartilhadas.

Para comparar, usar `PROFILE.freezeCamera=true` e
`PROFILE.chunkManifest=null` no topo do script. As opções `hud`, `scene`,
`actors`, `batch` e `unlitScene` isolam outros custos. Voltar a
`freezeCamera=false` para a órbita interativa. A inicialização do pad pode
produzir movimento antes da configuração analógica terminar; por isso os
resultados definitivos travam a câmera.

## Limites da medição e referências

Comparações em PCSX2 2.8.2, EE cycle rate/skip padrão (0/0), mesmo ELF,
30 frames de aquecimento e 60 medidos por variante. Um run por variante;
sem estimativa de variância entre runs. Tempos de submissão usam o timer da
EE e podem incluir esperas nativas; não são um tempo isolado de rasterização
do GS. O intervalo entre draws inclui apresentação e sincronização.
Os testes ocorreram em perfil isolado em `/tmp/comz2-performance-audit`.
Uma verificação adicional da versão final mediu 360 frames em seis janelas
de 60 frames: 59,9383–59,9407 FPS, uploads zero e VRAM livre constante.
Após a atualização do texto de diagnóstico, o HUD custou aproximadamente
4,53 ms, e o cenário continuou em 9,02 ms. Os caminhos dos assets usados
nessa verificação são os mesmos da versão final do projeto.

O resultado não certifica 60 FPS em todas as posições, com oito inimigos
animados, colisões, partículas ou no PS2 real. Triângulos/UVs/normais foram
preservados, mas uma comparação visual detalhada em movimento ainda deve
ser feita, especialmente em superfícies coplanares e máscaras alpha.

Referências locais: `AthenaEnv/README.md`, seção “JavaScript or native?”;
`src/modules/render3d/render3d.d.ts`;
`src/modules/render3d/native/render3d_gs.c`;
`src/modules/render3d/native/render3d_clip.c`;
`src/modules/model3d/native/texture3d_gs.c`;
`docs/TEXTURE_UPLOAD.md`; módulos `scene3d`, `lod`, `camerarig3d`, `profiler`.
Checkout consultado: `9455de5`. A procedência de compilação do ELF fornecido
não foi inferida desse checkout; seu SHA-256 consta do JSON de resultados.
O [repositório oficial consultado](https://github.com/AthenaENV-PS2-GAMES/AthenaEnv)
também descreve a arquitetura modular e o acesso ao hardware por módulos
nativos; os detalhes desta auditoria usam os arquivos e o ELF locais.
