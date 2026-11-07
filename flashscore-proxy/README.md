# Flashscore proxy

Worker separado do proxy WinDrawWin. Faz apenas relay de HTML de uma página
individual de jogo do domínio móvel público `m.flashscore.pt`.

## Endpoints

- `GET /health` — estado do Worker.
- `GET /match?id=<match-id>` — obtém a página HTML de uma partida.\n- `GET /inspect?id=<match-id>` — inspeciona o sumário do jogo.
- `GET /inspect?id=<match-id>&tab=statistics|lineups|standings|commentary|h2h` — inspeciona um separador autorizado do mesmo jogo. `summary` é o separador predefinido.\n- `GET /record?id=<match-id>` — recolhe a página de estatísticas e, quando há estatísticas disponíveis, consulta também o feed de períodos para obter cantos totais, HT e ST. Devolve ainda, quando identificadas sem ambiguidade, odds 1X2 da Bwin.

O identificador e o separador são validados. O destino é sempre construído internamente no domínio `https://m.flashscore.pt`, sem aceitar URLs arbitrários. Os separadores autorizados são mapeados para os caminhos observados nos links internos do HTML.

## Limites de segurança

- Não encaminha cookies nem credenciais.
- Não segue redirecionamentos.
- Não contorna CAPTCHA, bloqueios, limites de pedidos ou controlos de acesso.
- Não usa rotação de IPs nem falsificação de impressões digitais.
- `/match` devolve HTML; `/record` devolve os campos estruturados extraídos da página de estatísticas e, quando faltam os parciais HT/ST num jogo terminado, consulta também o Sumário para tentar recuperar os golos por parte. Só aceita os parciais quando a decomposição é validada e o FT coincide. As odds só são incluídas quando o identificador de bookmaker Bwin (459), a indicação `bwin.pt` e o triplo 1X2 são confirmados.
- Respostas bem-sucedidas são colocadas em cache durante 10 minutos.
- Respostas de erro não são guardadas em cache.
- Pedidos recusados (incluindo HTTP 403/429) são interrompidos e reportados. `/record` faz apenas um pedido ao Flashscore por jogo e não executa descoberta secundária.

## Deploy

O workflow usa os segredos GitHub já utilizados pelo proxy WinDrawWin:

- `CLOUDFLARE_API_TOKEN`
- `CLOUDFLARE_ACCOUNT_ID`

O Worker é independente e não altera o proxy WinDrawWin.
