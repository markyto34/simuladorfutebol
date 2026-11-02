# Flashscore proxy

Worker separado do proxy WinDrawWin. Faz apenas relay de HTML de uma página
individual de jogo do domínio móvel público `m.flashscore.pt`.

## Endpoints

- `GET /health` — estado do Worker.
- `GET /match?id=<match-id>` — obtém a página HTML de uma partida.\n- `GET /inspect?id=<match-id>` — devolve um diagnóstico JSON compacto (título, menções Bwin, excertos e candidatos numéricos/de resultado), sem devolver o HTML.

O identificador é validado e o destino é sempre construído internamente como
`https://m.flashscore.pt/jogo/<id>/`. Não aceita URLs arbitrários.

## Limites de segurança

- Não encaminha cookies nem credenciais.
- Não segue redirecionamentos.
- Não contorna CAPTCHA, bloqueios, limites de pedidos ou controlos de acesso.
- Não usa rotação de IPs nem falsificação de impressões digitais.
- Só devolve HTML; não afirma que as odds Bwin estejam incluídas no HTML.
- Respostas bem-sucedidas são colocadas em cache durante 10 minutos.
- Respostas de erro não são guardadas em cache.
- Pedidos recusados (incluindo HTTP 403/429) são interrompidos e reportados.

## Deploy

O workflow usa os segredos GitHub já utilizados pelo proxy WinDrawWin:

- `CLOUDFLARE_API_TOKEN`
- `CLOUDFLARE_ACCOUNT_ID`

O Worker é independente e não altera o proxy WinDrawWin.
