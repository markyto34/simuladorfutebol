# Simulador de Futebol

Aplicação independente do repositório `futebol-stats`. Reutiliza o formato de dados históricos Open Matchday, sem alterar o projeto original.

## Funcionalidades atuais
- Interface responsiva em português.
- Sem preenchimento manual de estatísticas: todos os campos são de leitura e recebem médias automaticamente após a seleção das equipas.
- Importação automática de golos, cantos, remates, remates à baliza, faltas e cartões quando disponíveis.
- Importação automática de resultados CSV por competição e época a partir de Open Matchday.
- Seleção de equipas com preenchimento automático de médias casa/fora.
- Amostras configuráveis: últimos 5, 10, 15 ou todos os jogos disponíveis.
- Cache persistente no navegador (IndexedDB, 24 horas) e cache de sessão de 15 minutos como fallback, reduzindo pedidos repetidos.
- 10.000 simulações Monte Carlo executadas localmente no navegador.
- Golos modelados com distribuição de Poisson.
- Cantos modelados com distribuição binomial negativa para permitir maior dispersão.
- Resultados independentes por indicador: se uma competição não tiver cantos, a simulação de golos continua disponível; cada mercado só é calculado quando tem as médias necessárias.
- Simulação adicional de remates, remates à baliza, faltas e cartões amarelos/vermelhos quando as quatro médias necessárias têm cobertura.

## Fontes de dados
Os resultados são obtidos dos CSV publicados por [oladeeayo/open-matchday](https://github.com/oladeeayo/open-matchday), no formato:
`https://raw.githubusercontent.com/oladeeayo/open-matchday/master/data/<competicao>/results_<epoca>.csv`

A aplicação apresenta atualmente a época 2026/27; a disponibilidade de ficheiros varia por competição. A fonte publica os CSVs diariamente. O esquema inclui remates, remates à baliza, faltas, cantos, cartões amarelos e vermelhos, mas a cobertura detalhada é desigual (cerca de 19% das linhas no conjunto publicado). Campos vazios significam dados indisponíveis, nunca zero. A aplicação importa os campos disponíveis e mantém cada indicador independente: a falta de cantos, por exemplo, não bloqueia uma simulação de golos. Estatísticas em falta permanecem indisponíveis e não podem ser preenchidas manualmente. A utilização do conjunto Open Matchday é para fins informativos não comerciais, com atribuição à fonte.

## Executar
Abre `index.html` num navegador moderno. Não requer instalação nem chave API. Para publicação, pode ser alojado como site estático (por exemplo, Cloudflare Pages ou GitHub Pages).

## Modelo e limitações
As médias de cada equipa são calculadas a partir dos jogos da amostra escolhida, separando jogos em casa e fora. A expectativa para cada equipa combina a sua média ofensiva com a média de golos/cantos concedidos pelo adversário no contexto correspondente.

O modelo atual é experimental. Os indicadores adicionais usam binomial negativa com dispersões iniciais fixas e independentes entre equipas; esta hipótese é provisória e ainda precisa de backtesting próprio. O modelo ainda não ajusta por força da competição, qualidade dos adversários, alinhamentos, lesões, treinador, contexto tático ou estado do marcador. As distribuições assumidas precisam de validação com backtesting cronológico antes de serem consideradas fiáveis. Os resultados são estimativas estatísticas, não garantias nem recomendações de aposta.

## Próximas etapas
1. Validar o parser com CSVs reais de várias ligas e épocas.
2. Criar testes automatizados e backtesting walk-forward para golos e cantos.
3. Adicionar tendências de forma recente, força de calendário e regularização por liga.
4. Calibrar as distribuições e os limiares por competição, usando apenas previsões fora da amostra e comparando-as com baselines simples.
5. Construir histórico de análises e comparação entre equipas.

## Backtesting
O motor `scripts/backtest.cjs` executa um teste cronológico (walk-forward): para cada jogo, usa apenas partidas anteriores e separa o histórico casa/fora. Mede MAE, RMSE e viés médio (erro com sinal) para golos, cantos, remates, remates à baliza, faltas e cartões, sempre que há cobertura. Cada métrica apresenta o número de jogos efetivamente avaliados. O relatório também estima a dispersão binomial negativa por máxima verosimilhança (grelha de parâmetros), compara-a com Poisson e não emite uma calibração quando existem menos de 30 observações. Os parâmetros calculados são candidatos de validação, não são aplicados automaticamente à interface. O workflow GitHub Actions corre automaticamente em alterações, semanalmente e pode ser iniciado manualmente. O relatório é guardado como artefacto `backtest-report`, incluindo erros, viés, dimensão da amostra e parâmetros de dispersão candidatos.

## Publicação
O ficheiro `render.yaml` prepara a publicação como site estático no Render. O repositório também pode ser alojado no Cloudflare Pages ou GitHub Pages; a ligação da conta de alojamento é necessária para concluir o primeiro deploy.


## Atualização automática e cobertura de estatísticas
A aplicação carrega automaticamente o CSV selecionado ao abrir a página e mantém uma cache persistente local de 24 horas (IndexedDB), além de uma cache de sessão de 15 minutos como fallback. Após selecionar as duas equipas, preenche todos os campos estatísticos de forma automática e bloqueia a edição manual. O Open Matchday publica os dados diariamente. A fonte inclui remates, remates à baliza, faltas, cantos e cartões amarelos/vermelhos, mas a cobertura detalhada é limitada e varia por competição. O esquema atual não inclui posse de bola. Os valores ausentes permanecem nulos e são excluídos das médias. A fonte é utilizada para fins informativos não comerciais e deve ser atribuída a [open-matchday](https://github.com/oladeeayo/open-matchday).


## Expansão de fontes gratuitas

A integração de novas fontes é feita apenas depois de verificar cobertura real, formato e condições de utilização. O [openfootball](https://github.com/withqwerty/open-football) e os seus repositórios de resultados históricos podem complementar resultados/golos, mas não substituem estatísticas de cantos, remates ou faltas. Fontes com condições que proíbem recolha automatizada, uso por bots/IA ou redistribuição não são integradas sem autorização explícita. Não existe dependência obrigatória de uma API paga. Os dados em falta continuam identificados como indisponíveis.

## Recolha Flashscore: estatísticas e odds Bwin

O Worker Flashscore disponibiliza `/record?id=<match_id>`. Este endpoint consulta uma única página de estatísticas do jogo e devolve um registo estruturado com as estatísticas identificadas e, quando a identificação é inequívoca, o mercado 1X2 da Bwin apresentado nessa página. A identificação da Bwin exige o marcador de bookmaker `459` e a indicação `bwin.pt`; odds de outras casas não são exportadas.

Para recolher uma lista pequena de jogos e atualizar os CSVs separados:

```bash
node scripts/collect-flashscore-csv.mjs ID_DO_JOGO_1 ID_DO_JOGO_2
```

Ou descobrir os IDs dos jogos de uma data e recolhê-los sequencialmente:

```bash
node scripts/collect-flashscore-csv.mjs --date=2026-11-01
```

O script cria/atualiza:
- `data/flashscore-statistics.csv` — estatísticas casa/fora e identificação do jogo.
- `data/bwin-odds-flashscore.csv` — apenas odds 1X2 da Bwin observadas no momento da recolha.

As estatísticas são deduplicadas por `match_id`; as odds mantêm observações distintas por jogo e instante de recolha. O intervalo predefinido entre pedidos é 1,5 segundos e pode ser alterado por `FLASHSCORE_REQUEST_DELAY_MS`. O endereço do Worker pode ser configurado por `FLASHSCORE_PROXY_URL`. Se o Flashscore responder 403 ou 429, o script interrompe a sequência sem tentar contornar o bloqueio. A base CSV histórica existente não é substituída.
