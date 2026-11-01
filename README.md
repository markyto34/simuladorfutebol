# Simulador de Futebol

Aplicação independente do repositório `futebol-stats`. Reutiliza o formato de dados históricos Open Matchday, sem alterar o projeto original.

## Funcionalidades atuais
- Interface responsiva em português.
- Entrada manual de médias de golos e cantos.
- Importação automática de resultados CSV por competição e época a partir de Open Matchday.
- Seleção de equipas com preenchimento automático de médias casa/fora.
- Amostras configuráveis: últimos 5, 10, 15 ou todos os jogos disponíveis.
- Cache de sessão de 15 minutos para reduzir pedidos repetidos.
- 10.000 simulações Monte Carlo executadas localmente no navegador.
- Golos modelados com distribuição de Poisson.
- Cantos modelados com distribuição binomial negativa para permitir maior dispersão.
- Resultados: probabilidades 1X2, resultado modal, médias de golos/cantos e linhas Over 1.5/2.5/3.5 golos e Over 8.5/9.5/10.5 cantos.

## Fontes de dados
Os resultados são obtidos dos CSV publicados por [oladeeayo/open-matchday](https://github.com/oladeeayo/open-matchday), no formato:
`https://raw.githubusercontent.com/oladeeayo/open-matchday/master/data/<competicao>/results_<epoca>.csv`

A aplicação suporta as competições configuradas na interface e as épocas 2023/24 a 2026/27, desde que o respetivo ficheiro exista na fonte. A cobertura de cantos depende dos campos publicados em cada CSV; quando faltam dados, os campos continuam editáveis manualmente e não são convertidos em zero.

## Executar
Abre `index.html` num navegador moderno. Não requer instalação nem chave API. Para publicação, pode ser alojado como site estático (por exemplo, Cloudflare Pages ou GitHub Pages).

## Modelo e limitações
As médias de cada equipa são calculadas a partir dos jogos da amostra escolhida, separando jogos em casa e fora. A expectativa para cada equipa combina a sua média ofensiva com a média de golos/cantos concedidos pelo adversário no contexto correspondente.

O modelo atual é experimental. Ainda não ajusta por força da competição, qualidade dos adversários, alinhamentos, lesões, treinador, contexto tático ou estado do marcador. As distribuições assumidas precisam de validação com backtesting cronológico antes de serem consideradas fiáveis. Os resultados são estimativas estatísticas, não garantias nem recomendações de aposta.

## Próximas etapas
1. Validar o parser com CSVs reais de várias ligas e épocas.
2. Criar testes automatizados e backtesting walk-forward para golos e cantos.
3. Adicionar tendências de forma recente, força de calendário e regularização por liga.
4. Acrescentar remates, faltas, cartões e posse, apenas onde a fonte tiver cobertura verificável.
5. Construir histórico de análises e comparação entre equipas.

## Backtesting
O motor `scripts/backtest.cjs` executa um teste cronológico (walk-forward): para cada jogo, usa apenas partidas anteriores e separa o histórico casa/fora. Mede MAE e RMSE para golos da casa, golos fora, golos totais e cantos totais quando há cobertura. O workflow GitHub Actions corre automaticamente em alterações, semanalmente e pode ser iniciado manualmente. O relatório é guardado como artefacto `backtest-report`.

## Publicação
O ficheiro `render.yaml` prepara a publicação como site estático no Render. O repositório também pode ser alojado no Cloudflare Pages ou GitHub Pages; a ligação da conta de alojamento é necessária para concluir o primeiro deploy.
