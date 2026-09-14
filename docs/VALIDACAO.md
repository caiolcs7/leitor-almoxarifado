# Validação da entrega

Execução local em 12–13/09/2026, Windows, Node.js 24.19.0, Chromium automatizado pelo Playwright 1.63.0. Os resultados abaixo descrevem testes executados; emulação de tela e câmera sintética não equivalem a homologação em celulares físicos.

## Resultado técnico

| Verificação            | Resultado                                                                |
| ---------------------- | ------------------------------------------------------------------------ |
| `npm run test`         | 85 testes aprovados em 6 arquivos                                        |
| `npm run test:e2e`     | 8 cenários aprovados, aproximadamente 1,1 minuto                         |
| `npm run lint`         | Aprovado, sem erros ou avisos                                            |
| `npm run typecheck`    | Aprovado; também executado no build                                      |
| `npm run build`        | Aprovado; manifest, service worker, worker e WASM gerados                |
| `npm audit --omit=dev` | Nenhuma vulnerabilidade conhecida reportada nas dependências de produção |
| Preview final na raiz  | Página inicial abriu sem erros JavaScript reportados                     |

O build emite um aviso de tamanho sobre o módulo ExcelJS (aproximadamente 930 kB minificado / 256 kB gzip). Ele é importado sob demanda e incluído no cache da PWA para permitir a primeira exportação sem rede. O precache completo tem aproximadamente 2,43 MiB. O aviso não foi ocultado nem é erro de compilação.

## Cenário principal de aceitação

O navegador criou a sessão **Teste R01** e decodificou imagens Data Matrix geradas independentemente com `bwip-js`. Cada uma das cinco etiquetas foi realmente processada pelo decoder. Após duas posições e três produtos, o processo do navegador foi fechado e reaberto com o mesmo perfil persistente e com a rede desabilitada.

O endereço ativo e todos os registros foram recuperados. Ainda offline, outra imagem Data Matrix foi decodificada e o XLSX foi baixado pela interface, sem ter sido exportado anteriormente nesse perfil. O arquivo baixado foi reaberto por ExcelJS e os valores conferidos:

| Código do Produto | Endereço     |
| ----------------- | ------------ |
| ITPFPHM510ESAI4   | R01A1C03DP02 |
| ITPRCSEM03AI4     | R01A1C03DP02 |
| ITARSRM003AI4     | R01A1C04DP02 |

O mesmo cenário verificou edição e exclusão offline, recarga, desfazer e restaurar. O teste espera a confirmação de salvamento antes de encerrar ou recarregar a página.

## Cobertura de leitura e dados

A atualização de 14/09 foi validada contra recortes das etiquetas reais fornecidas: o decoder extraiu `251MPC149M050P6<GS>371`, `251ITCP001M0016A<GS>371` e `A1;R02A1C01EP02`; o parser produziu respectivamente `MPC149M050P6`, `ITCP001M0016A` e `R02A1C01EP02`. Casos HRI equivalentes para MPC, STPC e ITCP também possuem regressão automatizada. O cenário de navegador confirma que o endereço lido preenche a entrada manual e que `SEM CODIGO` e `VAZIO` são persistidos como registros explícitos.

Dois testes de migração abriram um banco v1 com dados existentes e verificaram atualização para v3, preservando registros, endereço ativo, par pendente, preferências e regras personalizadas. Um teste adicional restaurou configurações de backup antigo e confirmou que a restrição a IT não voltou.

- Data Matrix normal, rotacionado e invertido, incluindo os formatos de endereço complexo e bombona; QR Code e Code 128 também decodificados em testes próprios.
- Imagem sem código rejeitada; controles, espaços, Unicode, identificadores AIM, wrappers completos e ambiguidade exercitados no parser.
- Vídeo de câmera sintética Data Matrix mantido por quatro segundos: um único registro, sem duplicação por frames. A mudança de tela encerrou o `MediaStreamTrack`.
- HID com Enter, entradas rápidas enfileiradas, impedimento de produto sem endereço, duplicado ignorado ou aceito e clique duplo em confirmação sem criar registros extras.
- Modos pareados nas duas ordens e preservação de par incompleto; transações concorrentes sem perda de contagem ou repetição de ordem.
- Entrada manual, edição individual, endereço em lote, desfazer/restaurar, busca, duplicação, renomeação, arquivamento e exclusão de sessões.
- Backup real baixado e restaurado como cópia; rejeição de versão inválida, dados órfãos, IDs repetidos e configurações inválidas; limpeza com confirmação forte.

## PWA, atualização e subdiretório

Os testes de navegador construíram e acessaram a aplicação em `/teste-subpasta/`. Conferiram assets, manifest, ícones, scope/start URL, recarga de uma rota de sessão e service worker controlando a página. O monitoramento de requisições no cenário principal não registrou chamadas HTTP externas à aplicação.

Uma nova versão real do service worker foi disponibilizada durante o teste. O aplicativo mostrou o aviso, aguardou o clique em Atualizar, ativou o worker e recarregou a mesma sessão com endereço e registro preservados. Foi corrigida uma falha em que a interface permanecia em “Atualizando”; a ativação agora aguarda `controllerchange` e tem tratamento de demora.

Na validação inicial, a compatibilidade com subdiretório foi conferida localmente. Em 13/09/2026, o aplicativo foi publicado em [GitHub Pages](https://caiolcs7.github.io/leitor-almoxarifado/). O [workflow de publicação](https://github.com/caiolcs7/leitor-almoxarifado/actions/runs/34761497545) concluiu com sucesso instalação, lint, testes, build, testes de navegador e deploy em Ubuntu. O site público abriu por HTTPS sem erros JavaScript e exibiu “Pronto para uso offline”. O teste de câmera com aparelhos físicos no endereço publicado permanece pendente.

## Interface

Home, scanner, registros e configurações foram verificados em larguras de **320, 360, 375, 390, 412, 430, 768, 1024, 1366 e 1920 px**, sem overflow horizontal nos 40 casos. Também foram exercitados modal em 320 px, tema escuro, feedback no viewport e seleção com área mínima de 44×44 px.

A revisão visual com impeccable identificou e resolveu dois problemas: feedback/decisão de duplicados abaixo da câmera no celular e área pequena de seleção. As recapturas foram revisadas e receberam disposição final de entrega. Isso não substitui testes de acessibilidade com leitores de tela ou uso em campo.

## Planilha em aplicativos de escritório

O XLSX efetivamente baixado foi aberto pelo **Microsoft Excel 16.0**, em modo somente leitura. Foram confirmados duas colunas, oito linhas usadas (incluindo título e cabeçalho), valores, filtro e congelamento. O próprio Excel exportou um PDF; a inspeção visual mostrou título, cabeçalho e três registros legíveis, sem cortes, em uma página A4.

O mesmo XLSX foi aberto pelo **LibreOffice Calc 26.2.6.3**, executado em modo headless com perfil isolado. Foi exportado como PDF e salvo novamente em XLSX; a leitura do arquivo salvo confirmou os três pares completos, duas colunas, cabeçalhos, filtro A5:B8 e congelamento das cinco primeiras linhas. A inspeção do PDF do Calc também confirmou uma página A4 legível e sem cortes. O pacote veio da [distribuição oficial do LibreOffice](https://www.libreoffice.org/download/download-libreoffice/) e teve SHA-256 conferido antes da extração local. Não foi instalado como aplicativo padrão do sistema.

Evidências locais são geradas em `artifacts/` (ignorado pelo Git), incluindo o XLSX baixado, PDFs/renders do Excel e LibreOffice, `libreoffice-validation.json`, backup e medições responsivas. Capturas de revisão ficam em `.impeccable/review/`. O relatório Playwright é produzido em `playwright-report/`. O sistema visual está documentado em `DESIGN.md` e `.impeccable/design.json`, com tokens extraídos da implementação.

## Limites reais e homologação em campo

- Não foram testados telefones físicos Android/iPhone, câmera real com etiquetas do almoxarifado, scanner USB/Bluetooth físico, lanterna, zoom, foco, vibração ou instalação PWA em celular. O navegador e o hardware determinam o suporte dessas APIs.
- Chrome/Edge/Safari físicos não foram homologados individualmente. Os testes automatizados usaram Chromium; a responsividade foi emulada.
- Não houve teste de carga prolongado com dezenas de milhares de registros ou medição de bateria em turno de trabalho. A leitura real de etiquetas danificadas, refletivas ou distantes precisa ser conferida com as etiquetas disponíveis no local.
- Produtos não possuem lista de prefixos. A validação técnica permanece limitada a 128 caracteres normalizados e ao conjunto seguro usado pelos identificadores industriais (`A-Z`, `0-9`, ponto, sublinhado, barra e hífen). Endereços só recebem tratamento especial quando formam uma posição completa; nenhum código parcial é completado automaticamente.
- IndexedDB mantém dados por origem e navegador, mas não é backup externo. Limpar os dados do navegador, trocar origem ou perder o dispositivo pode impedir a recuperação. Há exportação e restauração JSON para esse fim.
- Importação XLSX e sincronização em nuvem não foram implementadas; a primeira era opcional e a segunda ficou explicitamente fora do escopo.

Antes de adotar no almoxarifado, publique em HTTPS e execute o cenário principal com etiquetas e aparelhos reais, desligando a rede depois de aparecer “Pronto para uso offline”. Confira o arquivo exportado e faça um backup JSON do levantamento de teste.
