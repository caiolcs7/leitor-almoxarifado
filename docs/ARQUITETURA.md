# Arquitetura

Aplicação React 19 + TypeScript strict + Vite 8. A interface é dividida em sessões, scanner, registros, exportação e configurações. CSS com tokens define superfícies claras/escuras, cores de estado, áreas de toque, tipografia do sistema e fonte monoespaçada para identificadores.

## Fluxo dos dados

Todas as entradas passam pelo mesmo parser: Unicode NFKC → remoção de espaços, controles e invisíveis → identificador AIM conhecido → maiúsculas → wrapper configurado sem ambiguidade → classificação → regra opcional de endereço → associação.

As regras iniciais foram derivadas apenas dos exemplos fornecidos. Não se classifica qualquer texto iniciado em R como endereço. Correspondência simultânea a produto e endereço é recusada. Prefixos 251 e sufixos 371 não são removidos por padrão; exigem uma configuração de wrapper completo, um payload válido e um original não válido. Não há inferência de caracteres ausentes.

O modo fixo guarda `activeAddress`. Ler um endereço só altera esse estado. Ler um produto sem endereço retorna erro sem registro. Os modos pareados guardam um primeiro elemento em `pending`, exigem a ordem escolhida e limpam o par apenas após registro ou cancelamento. Outro elemento do mesmo tipo não substitui silenciosamente o primeiro.

## Persistência e concorrência

Dexie abstrai IndexedDB, com schema versão 1 e tabelas `sessions`, `records`, `settings` e `history`. Os índices incluem sessão/ordem, sessão/código/endereço e sessão/horário. Cada leitura executa transação atômica envolvendo registro, contador, estado do par/endereço e histórico. A sequência monotônica não é reutilizada após desfazer. Alterações não dependem de servidor.

Backup JSON validado com Zod verifica estrutura, versão, referências, identificadores repetidos e regras. A restauração é transacional e usa novos IDs; quantidades e próxima ordem são recalculadas. Câmeras e IDs de dispositivo importados podem precisar ser escolhidos novamente em outro aparelho.

## Leitura e repetição

`ScannerService` gerencia câmera, seleção de dispositivo, foco contínuo quando suportado, zoom, lanterna, ciclo de decodificação e liberação de `MediaStream`. Usa traseira/resolução ideal 1280×720 e processa no máximo um frame por vez, com pausa de 160 ms entre tentativas. A decodificação WASM roda em Web Worker.

Quando `BarcodeDetector.getSupportedFormats()` inclui `data_matrix`, a API nativa é usada. Após erros repetidos, o scanner passa para ZXing-C++; o fallback também é tentado periodicamente quando o nativo não encontra nada. Câmera e imagens rejeitam múltiplas etiquetas no mesmo enquadramento, para evitar associação por ordem arbitrária. Sequências estruturadas incompletas não são aceitas.

O módulo `zxing-wasm/reader` fornece Data Matrix, QR Code, Code 128, Code 39 e ITF. Seu WASM é empacotado localmente, substituindo o carregamento padrão por CDN. A escolha oferece decodificação nativa C++/WASM e opções de rotação/inversão; não representa uma afirmação de superioridade medida contra todas as bibliotecas ou etiquetas industriais. Referência: [repositório oficial zxing-wasm](https://github.com/Sec-ant/zxing-wasm).

O anti-repetição de câmera mantém a última etiqueta bloqueada enquanto visível. Libera ao detectar outro código ou após ausência confirmada por 900 ms. Tempo de processamento lento sozinho não libera a etiqueta. Uma repetição de código/endereço já salvo gera aviso com Ignorar/Adicionar novamente; as entradas ficam pausadas até a escolha. O operador pode desativar esse aviso, mantendo a proteção contra frames repetidos.

A câmera para ao sair da tela, abrir uma operação modal, pausar ou ocultar a aba. Wake Lock é opcional e liberado ao sair. Som usa Web Audio iniciado após interação, com frequências distintas; vibração depende da API do dispositivo. Nenhum frame sai do navegador.

## PWA e atualização

`vite-plugin-pwa` e Workbox geram manifest e service worker. Todos os assets essenciais, incluindo módulos de exportação, Worker e WASM, entram no precache. A instalação só termina quando esses arquivos estão disponíveis. Rotas com hash e URLs relativas mantêm compatibilidade com subdiretórios do GitHub Pages.

Atualizações usam prompt: a nova versão espera a ação Atualizar. O botão desmonta o scanner e aguarda a transação do banco antes de solicitar SKIP_WAITING ao worker. A recarga preserva a rota e aguarda controllerchange, com tratamento de timeout; não depende da classificação isUpdate do Workbox. O schema não é removido. Migrações futuras devem usar `db.version(n).stores(...).upgrade(...)`.

## Relatórios

ExcelJS é carregado sob demanda e já está disponível no cache offline. O XLSX usa apenas A/B como colunas de dados: Código do Produto e Endereço. Há título mesclado, sessão/data, cabeçalhos na linha 5, linhas alternadas, texto explícito para identificadores, bordas, filtro, congelamento e impressão A4 ajustada à largura. Ordenação pode seguir leitura, endereço ou produto; opcionalmente há abas por rua, além da aba Todos os registros. CSV e backup JSON são recursos complementares.

Não foi implementada importação de XLSX, explicitamente opcional no pedido; restauração de backup JSON está disponível. Sincronização, login e serviços de nuvem ficam fora desta versão.
