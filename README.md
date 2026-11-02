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

## Recolha diária Flashscore: estatísticas e odds Bwin

O Worker Flashscore disponibiliza `/record?id=<match_id>`. Para cada jogo, este endpoint consulta uma única página de estatísticas e extrai dessa mesma resposta as 13 categorias estatísticas e, quando a identificação é inequívoca, o mercado 1X2 da Bwin apresentado no Flashscore. A identificação da Bwin exige o marcador de bookmaker `459` e a indicação `bwin.pt`; não são recolhidas odds de outras casas.

O workflow `.github/workflows/recolha-diaria-flashscore.yml` executa automaticamente todos os dias às 05:30 UTC. Descobre os jogos do dia anterior segundo o calendário de Portugal e recolhe cada jogo sequencialmente, com um intervalo mínimo de 2,5 segundos entre pedidos. Também pode ser iniciado manualmente para uma data específica no separador Actions do GitHub.

A recolha diária:
- Faz apenas uma consulta de estatísticas por jogo; as odds Bwin são extraídas da mesma resposta.
- Atualiza `data/flashscore-statistics.csv` com os dados estatísticos e de identificação.
- Atualiza `data/bwin-odds-flashscore.csv` apenas com odds 1X2 da Bwin observadas no momento da recolha.
- Preserva o histórico existente, deduplica estatísticas por `match_id` e observações de odds por jogo e instante de recolha.
- Valida os dois CSV antes de os guardar no repositório.
- Interrompe a sequência se o Flashscore responder 403 ou 429; não tenta contornar bloqueios.
- Tem um limite de segurança de 2.000 jogos descobertos por execução diária. Se o limite for excedido, a recolha não começa.

**Nota sobre as odds:** como são recolhidas juntamente com as estatísticas dos jogos concluídos, representam as odds Bwin que o Flashscore apresenta no instante da recolha. Não devem ser interpretadas como odds pré-jogo, de abertura ou de fecho.

Para uma recolha manual pequena por IDs, continua disponível o comando:

```bash
node scripts/collect-flashscore-csv.mjs ID_DO_JOGO_1 ID_DO_JOGO_2
```

A validação geral do histórico pode ser executada com:

```bash
node scripts/validate-flashscore-history.mjs
```
