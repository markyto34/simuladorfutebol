# Simulador de Futebol

Aplicação independente que utiliza exclusivamente estatísticas e resultados históricos recolhidos do Flashscore.

## Funcionalidades atuais
- Interface responsiva em português.
- Sem preenchimento manual de estatísticas: todos os campos são de leitura e recebem médias automaticamente após a seleção das equipas.
- Importação automática de golos, cantos, remates, remates à baliza, faltas e cartões quando disponíveis.
- Importação automática de resultados e estatísticas por competição a partir do histórico Flashscore.
- Seleção de equipas com preenchimento automático de médias casa/fora.
- Amostras configuráveis: últimos 5, 10, 15 ou todos os jogos disponíveis.
- Cache persistente no navegador (IndexedDB, 24 horas) e cache de sessão de 15 minutos como fallback, reduzindo pedidos repetidos.
- 10.000 simulações Monte Carlo executadas localmente no navegador.
- Golos modelados com distribuição de Poisson.
- Cantos modelados com distribuição binomial negativa para permitir maior dispersão.
- Resultados independentes por indicador: se uma competição não tiver cantos, a simulação de golos continua disponível; cada mercado só é calculado quando tem as médias necessárias.
- Simulação adicional de remates, remates à baliza, faltas e cartões amarelos/vermelhos quando as quatro médias necessárias têm cobertura.

## Fontes de dados\nA fonte estatística do simulador é exclusivamente o Flashscore, através dos dados recolhidos e guardados no histórico próprio do projeto. As competições disponíveis são carregadas a partir do índice de competições elegíveis do Flashscore. Os campos sem cobertura permanecem indisponíveis e nunca são convertidos em zero.\n\n## Executar
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
O workflow principal de backtesting usa agora o histórico próprio do Flashscore em `data/flashscore-statistics.csv`, sem descarregar resultados de outra fonte. O motor `scripts/backtest-flashscore-simulator.cjs` usa também `data/simulator-complete-competitions.json` para avaliar apenas as competições completas que aparecem no seletor do site, incluindo os respetivos aliases de origem. Executa walk-forward cronológico e mantém cada país/competição isolado. Para cada jogo, só utiliza partidas de datas anteriores; jogos do mesmo dia só entram no histórico depois de todas as previsões desse dia.

O modelo reproduz a configuração atual do simulador: amostra predefinida dos últimos 5 jogos por equipa e local (configurável para 10 ou 15), mínimo de 3 observações por indicador e 5 para xG, ponderação de 65% golos históricos + 35% xG quando há cobertura completa, Poisson para golos e binomial negativa com as mesmas dispersões do simulador para cantos, remates, remates à baliza, faltas e cartões.

O relatório mede erro médio absoluto, RMSE e viés para cada indicador; Brier Score, Log Loss e fiabilidade para 1X2 e mercados binários; e apresenta resultados agregados e separados por competição. Inclui Over 1.5/2.5/3.5 e BTTS, mercados HT/ST disponíveis no simulador, cantos, remates, faltas e cartões. Campos ausentes continuam ausentes e os zeros explícitos são preservados. O workflow corre em PRs que alterem o modelo/dados, em alterações relevantes na branch principal, semanalmente e também pode ser iniciado manualmente. O relatório é publicado como artefacto `backtest-flashscore-simulator`.

O motor anterior `scripts/backtest.cjs` mantém-se disponível como benchmark independente, mas não é usado como substituto da validação do simulador Flashscore.

## Publicação
O ficheiro `render.yaml` prepara a publicação como site estático no Render. O repositório também pode ser alojado no Cloudflare Pages ou GitHub Pages; a ligação da conta de alojamento é necessária para concluir o primeiro deploy.


## Recolha diária Flashscore: estatísticas e odds Bwin

O Worker Flashscore disponibiliza `/record?id=<match_id>`. Para cada jogo, este endpoint consulta uma única página de estatísticas e extrai dessa mesma resposta as 13 categorias estatísticas e, quando a identificação é inequívoca, o mercado 1X2 da Bwin apresentado no Flashscore. A identificação da Bwin exige o marcador de bookmaker `459` e a indicação `bwin.pt`; não são recolhidas odds de outras casas.

O workflow `.github/workflows/recolha-diaria-flashscore.yml` executa automaticamente todos os dias às 05:30 UTC. Descobre os jogos do dia anterior segundo o calendário de Portugal. A descoberta diária também associa cada ID à competição e ao país apenas quando o HTML apresenta uma associação explícita e inequívoca. A recolha usa até 10 jogos em simultâneo e um intervalo global mínimo de 300 ms entre inícios de pedidos (configuração atual do workflow); interrompe novos pedidos perante HTTP 403/429. Também pode ser iniciado manualmente para uma data específica no separador Actions do GitHub.

A recolha diária:
- Faz apenas uma consulta de estatísticas por jogo; as odds Bwin são extraídas da mesma resposta. A identificação de país/competição vem da página diária de descoberta já consultada, sem um pedido adicional por jogo.
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
