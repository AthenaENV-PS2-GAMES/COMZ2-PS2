# Mecânicas do jogador e MP5

Mapa baseado nos scripts e assets extraídos presentes neste repositório.
O port continua com Mike e zumbis desativados. A implementação desta etapa
é a MP5 equipada, com disparo no cenário e munição finita. Não é ainda uma
reprodução completa do combate original. A revisão visual seguinte aplica UNLIT
a todo o mundo e restaura mira/texturas de efeitos; ver
[WEAPON_VISUALS.md](WEAPON_VISUALS.md).

## Implementado

- MP5 possuída e equipada no início. `PlayerWeapon` separa a coleção possuída
  da arma equipada e rejeita equipamento desconhecido. Há apenas uma arma
  configurada; não foi criado um seletor de outras armas.
- Mesh/textura originais de `Assets/PrefabInstance/MP5_0.prefab`, resolvido
  pelo GUID de `Assets/Resources/prefabs/weapon/MP5.prefab`. São 212 vértices,
  122 triângulos e um atlas PNG preservado byte a byte.
- Arma rígida anexada ao `Bip01 Prop1`, como em `PlayerController.InitWeapon()`.
  Segue a animação nativamente, inclusive durante corrida e recarga. Os pontos
  `fire_ori` e `bullet_eff_ori` mantêm seus transforms originais. A rotação
  de apresentação de -90° do prefab é descartada, conforme `WeaponController.Reset()`.
- Mira vertical pelo controle direito inclina o pivô `Spine_00`, incluindo cabeça,
  braços e arma, sem substituir os clips de animação. A câmera aplica push-in
  por sphere cast com fallback de raycast two-sided para paredes invertidas.
  O FOV muda de 70° para 50° a 120°/s enquanto a arma dispara e retorna ao
  normal ao sair do estado de tiro, conforme `ShooterGameCamera`.
- Dois alvos estacionários de teste ocupam pontos navegáveis à frente e ao lado
  do spawn; não são zumbis e não usam AI. Cada um tem hitboxes esféricas de
  torso/cabeça, e o primeiro hit válido recebe o dano original da MP5/Mike:
  `(12 × 0,13 + 16) × 1 = 3,64` por tiro. A superfície do cenário e a cobertura
  próxima à boca da arma bloqueiam o dano; HP, hitbox e resultado do disparo
  aparecem no HUD. `ENABLE_ZOMBIES` permanece `false`.
- Preparação de 0,2 s com `MP5_UpperBody_FireReady`, seguida de tiro automático
  a cada 0,13 s enquanto X/R1 estiver pressionado. A duração do clip de tiro
  é ajustada à cadência pelo `Animation3D.Player.speed`.
- Carregador de 100, total inicial de 400: HUD começa em `MP5 100/300`.
  **Total inclui o carregador**. Cada tiro decrementa carregador e total;
  recarregar redistribui o total existente, sem criar munição.
- Quadrado recarrega se houver espaço e reserva. Carregador é preenchido na
  entrada do estado, como em `WeaponData.Reload()`, mas o tiro permanece
  bloqueado até 85% do clip superior, à velocidade 1,2 do Mike. Segurar
  Quadrado ou gatilho não reinicia nem interrompe esse bloqueio.
- Ao esvaziar, o último tiro termina antes da recarga automática, inclusive
  se o gatilho for solto. Sem reserva, a arma fica em `EMPTY`.
- Camadas inferiores/superiores separadas; recarga parada usa também
  `MP5_LowerBody_Reload01`, e andando mantém a corrida nas pernas.
- Mira original de rifle, com recuperação, recoil e dispersão, e raycast preciso de triângulos em C contra o cenário;
  ignora a parte do raio atrás do jogador. Um segundo raio da boca da arma
  impede atravessar uma cobertura próxima que a câmera consegue enxergar.
- Flash, traçante e impactos agora usam as texturas e camadas dos prefabs
  originais, em sprites nativos com alpha/add. O pool é limitado a 16 partículas;
  não é a simulação completa do ParticleSystem Unity.
- Após soltar o tiro, estado `AFTER` retém a pose durante 1 s; Start restaura
  arma, munição, poses, efeitos e posição.
- Movimento usa velocidade configurada do Mike (7,6) menos drag da MP5 (0,5):
  frente 7,1, lados 5,68, trás 3,55 unidades/s. Interpola por ângulo como
  `SimpleCharacterMotor.UpdateSpeedVal()`, preservando a resposta quadrática
  do analógico. Seleção das corridas usa limiares originais de 60°/140°.

Os sistemas executam na ordem: lógica/input → animação nativa (-250) → câmera
(-200/-150) → LOD (-100) → Scene3D (0) → resolução do tiro (100) → desenho.
Assim, a saída do tiro usa o osso e a câmera do frame atual. Só existem
raycasts quando uma bala é disparada. São reutilizados os objetos de saída
das consultas e os nós dos efeitos.

## Mapa do original

| Mecânica | Evidência original | Situação no port |
|---|---|---|
| Posse/equipamento | [GameData.cs](../Assets/Scripts/Assembly-CSharp/GameData.cs): inicializa equipamento MP5; [AvatarData.cs](../Assets/Scripts/Assembly-CSharp/AvatarData.cs): exige `Owned` e distingue primária/secundária. | MP5 possuída/equipada em memória; sem loja, salvamento ou desbloqueios. |
| Criação/encaixe | [WeaponFactory.cs](../Assets/Scripts/Assembly-CSharp/WeaponFactory.cs): resolve Instance/Accessory; [PlayerController.cs](../Assets/Scripts/Assembly-CSharp/PlayerController.cs): `InitWeapon`, `ChangeCurWeapon`, `ResetMotorSpeed`. Prop1 para arma direita; Prop2 para Shield/Medicine. | MP5/Prop1 e redução de velocidade implementados. |
| Movimento e animações | `PlayerController.UpdateRunAni`, [SimpleCharacterMotor.cs](../Assets/Scripts/Assembly-CSharp/SimpleCharacterMotor.cs), [PlatformInputController.cs](../Assets/Scripts/Assembly-CSharp/PlatformInputController.cs): direção pela câmera e magnitude quadrática. | Quatro corridas e colisão/navmesh; ajustes procedurais de cabeça/tronco e aceleração Unity pendentes. |
| Dois estados paralelos | [PlayerStateType.cs](../Assets/Scripts/Assembly-CSharp/CoMZ2/PlayerStateType.cs), `PlayerController.MoveState/FireState`. | Movimento separado de IDLE/READY/SHOOT/AFTER/RELOAD/EMPTY. Estados de lock, habilidades, ferimento e morte ainda pendentes. |
| Preparação/cadência | [WeaponController.cs](../Assets/Scripts/Assembly-CSharp/WeaponController.cs): `OnReadyFire`, `CouldMakeNextShoot`, `ResetFireAniSpeed`. | 0,2 s e 0,13 s; velocidade do clip de tiro ajustada. Sem crossfade. |
| Munição/recarga | [WeaponData.cs](../Assets/Scripts/Assembly-CSharp/WeaponData.cs): `OnFire`, `Reload`, `GetRemainCount`; [PlayerReloadState.cs](../Assets/Scripts/Assembly-CSharp/CoMZ2/PlayerReloadState.cs): liberação a 85%. | Conservação de munição, recarga manual/automática e bloqueio implementados. |
| Tiro rifle | [AssaultRifleController.cs](../Assets/Scripts/Assembly-CSharp/AssaultRifleController.cs): raycast desde câmera; filtra frente do player; efeitos por material; flash/cartridge em pools. | Raycast de mira compara superfície e hitboxes de dois alvos estacionários; cobertura na boca da arma prevalece. Sprites originais de impacto/tracer. Classificação metal/madeira, estojos, áudio e objetos dinâmicos pendentes. |
| Dano | `WeaponData.ResetData`: DPS padrão × intervalo × dmgRatio. `WeaponController.GetDamageValWithAvatar`: `(weaponDamage + avatarDamage × interval) × ComboDamageRatio`. | MP5/Mike nível 1, sem combo: `(12 × 0,13 + 16 × 0,13) = 3,64` por hitbox de torso/cabeça, sem multiplicador de headshot. Aplicado a alvos de teste com HP; zumbis e AI seguem desativados. |
| Dispersão/recuo | [SightBeadScript.cs](../Assets/Scripts/Assembly-CSharp/SightBeadScript.cs): `GetFireOffset` sorteia disco, `Stretch` expande e recupera mira. [WeaponCfg.txt](../Assets/Resources/config/WeaponCfg.txt): MP5 recoil 10, stretch 1/5, máximo 20 no nível 1. | Textura zhunxin-1, recoil, expansão/recuperação e disco de dispersão implementados. Densidade das partículas adaptada ao PS2. |
| Auto-lock/câmera | `GameSceneController.DoAutoLock`: usa alvo válido próximo à mira, aplica correção; rifle chama ZoomIn durante tiro e ZoomOut em idle. | Mira vertical no tronco/cabeça/arma, zoom FOV 70°↔50° a 120°/s e colisão de câmera por sphere cast + raycast two-sided. Auto-lock e shake pendentes. |
| Pós-tiro | [PlayerAfterShootState.cs](../Assets/Scripts/Assembly-CSharp/CoMZ2/PlayerAfterShootState.cs), `WeaponCfg.AfterFireTime`. | Janela de 1 s; retorno ao idle/corrida. A liberação do gatilho começa a janela no próximo update, sem esperar o fim da última amostragem como o original. |
| Troca/segunda arma | `ChangeNextPrimaryWeapon`, `ChangeCurWeapon`, [PlayerSwitchWeaponState.cs](../Assets/Scripts/Assembly-CSharp/CoMZ2/PlayerSwitchWeaponState.cs); init atual percorre uma primária. Mike define secundária Baseball em AvatarCfg. | Apenas MP5. API impede equipar arma não possuída e trocar durante recarga; sem animação de troca/segunda arma. |
| Vida/armadura | `AvatarData.ResetData/Injured`: HP e armadura por nível; dano recebido `max(0, dano × (1 - armor/100))`; `PlayerController.OnHit/OnDead`. | HP100 do sandbox permanece; balanceamento original e estados visuais de dano/morte não portados. |
| Combo | `PlayerController.AddComboValue/ComboDologic`, [AvatarCfg.txt](../Assets/Resources/config/AvatarCfg.txt): limiares 10/20/30, máximo40; buffs de dano/cadência e decaimento. MP5 adiciona 0,6 por acerto em inimigo. | Mapeado, pendente. |
| Habilidades do Mike | [MikeController.cs](../Assets/Scripts/Assembly-CSharp/MikeController.cs): BaseballRobot, criação/ativação por eventos, bloqueio de movimento durante ativação; PlayerController possui skill_set. | Mapeado, pendente. |
| Itens/progressão | `PlayerController.OnGetItem`: ouro, HP proporcional, munição primária; `AvatarData.AddExp`, GameData/WeaponData: níveis, upgrades e custos. | Mapeado, pendente. |
| Morte/rebirth/controle | `EnableControll`, `OnRebirth`, PlayerDeadState: bloqueio e reinício com buff; missão/UI coordenam derrota e pagamento. | Start reinicia sandbox; fluxo de missão/rebirth pendente. |
| Eventos/animação/coop | [PlayerAnimationEvent.cs](../Assets/Scripts/Assembly-CSharp/PlayerAnimationEvent.cs): ataque/skills por eventos; PlayerCoopController/WeaponCoopController: rede. | Curvas TRS originais; eventos, mixer e multiplayer pendentes. |

## Conversão e verificações

```sh
python3 tools/export_unity_player_animations.py
python3 tools/export_player_weapon.py
python3 -m unittest tools.test_export_unity_player_animations tools.test_export_player_weapon
node tools/test_player_weapon.mjs
node tools/test_player_animation_states.mjs
node tools/test_player_shots.mjs
node tools/test_player_targets.mjs
```

`mike_animated.glb` agora contém 12 clips; os dez primeiros do teste anterior
mais FireReady e LowerBody_Reload01. `mp5_equipped.glb` é separado para manter
posse, visibilidade e equipamento independentes da skin do personagem. Os
JSONs acompanham nomes dos nós, fontes e hashes; o de MP5 também contém o
balanceamento extraído dos XMLs originais. Os tempos 0,2 e 0,85 vêm dos scripts. A revisão visual acrescenta a cor original dos materiais aos GLBs.

Testes verificam o PNG original, transforms dos sockets, rotação após Reset,
curvas e camadas disjuntas, conservação de munição, preparação, cadência,
recarga bloqueada, três recargas até esgotar as 400 balas e reset.

A etapa inicial, antes da correção visual descrita em WEAPON_VISUALS.md, passou no PCSX2 2.8.2 com `comz_navcoll.elf`: **59,94 FPS**
no intervalo medido de 1.530 frames, **428 KiB livres de VRAM**, upload zero
na amostra final, 169 disparos/impactos no cenário, duas entradas em recarga
(manual e automática), avanço do clip inferior e reset completo. O teste
também percorreu movimento e rotação de câmera. São 13 testes Python,
os testes JS de arma/animação, três de navegação e 11 regressões OBJ aprovados.
É evidência de uma execução da versão final no emulador, sem validação no PS2 real.

[Resultados, hashes e limites](benchmarks/player_weapons_2026-10-13/results.json),
[captura](benchmarks/player_weapons_2026-10-13/preview.png) e
[marcadores do ELF](benchmarks/player_weapons_2026-10-13/markers.log).
O snapshot `runtime_test.js` dessa pasta foi executado na raiz do perfil
isolado, com dependências e input simulado; não deve ser iniciado de dentro
da pasta de documentação.

Limites: raycast usa os chunks visíveis da cena Scene3D/LOD; o original
consulta layers físicos até 1.000 unidades. Aqui o mapa é carregado por inteiro,
mas chunks ocultos pelo LOD de 45 unidades não participam do tiro. O port
também usa o primeiro triângulo no raio, em vez de RaycastAll ordenado por
distância ao player. Não há ainda dano a inimigos, hitboxes, barris/caixas
destrutíveis, classificação de superfície ou equivalência completa dos efeitos Unity.
O segundo raio de cobertura é uma proteção acrescentada no port.
