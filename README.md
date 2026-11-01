# Simulador de Futebol

MVP independente do projeto `futebol-stats`.

## Estado atual
- Interface responsiva em português.
- Introdução manual de médias de golos e cantos por equipa.
- 10.000 simulações Monte Carlo executadas no navegador.
- Golos modelados com Poisson.
- Cantos modelados com uma distribuição binomial negativa para permitir maior dispersão.
- Resultados: probabilidades 1X2, placar modal, médias e linhas de golos/cantos.

## Executar
Abre `index.html` num navegador. Não requer instalação nem chave API.

## Limitações importantes
Os valores de entrada são médias fornecidas pelo utilizador. O MVP não importa ainda dados automaticamente e não ajusta por adversário, competição, forma recente, escalações, lesões ou contexto tático. Os resultados são exploratórios, não garantias.

## Próximas etapas
1. Validar o motor com testes e backtesting histórico.
2. Criar base de dados de equipas/competições e importação automática.
3. Acrescentar amostras, forma recente e separação casa/fora.
4. Adicionar mais métricas (remates, faltas, cartões, posse).
