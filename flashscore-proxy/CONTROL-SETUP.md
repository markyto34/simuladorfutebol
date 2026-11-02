# Configuração do controlo manual da recolha

O endpoint `/trigger-collection` do Worker permite ao monitor iniciar o workflow GitHub Actions sem expor credenciais GitHub no navegador.

## 1. Criar uma chave privada para o botão

Gera uma chave aleatória forte no teu computador (não a publiques no GitHub):

```bash
openssl rand -hex 32
```

Guarda o valor num gestor de palavras-passe. Esta é a chave que será introduzida no campo **Chave privada de controlo** do monitor. O monitor não a guarda nem a inclui no código.

## 2. Criar um token GitHub restrito

Cria um Fine-grained personal access token com acesso apenas ao repositório `markyto34/simuladorfutebol` e permissão de repositório **Actions: Read and write**. Não uses um token com acesso a todos os repositórios.

## 3. Guardar os dois valores como Secrets no Cloudflare

No painel Cloudflare:
1. Abre **Workers & Pages**.
2. Seleciona `simuladorfutebol-flashscore-proxy`.
3. Abre **Settings → Variables and Secrets**.
4. Adiciona os dois valores como **Secrets** (não como texto público):
   - `CONTROL_TOKEN`: a chave aleatória criada no passo 1.
   - `GITHUB_ACTIONS_TOKEN`: o Fine-grained token do passo 2.
5. Guarda as alterações.

O Worker é publicado pelo workflow existente de deploy quando as alterações desta branch forem integradas em `main`. Se os secrets forem adicionados depois do deploy, basta guardar/redeployar o Worker para garantir que ficam disponíveis.

## 4. Utilizar

Abre o Monitor de recolha, escolhe uma data não futura, introduz a chave privada e clica em **Iniciar recolha**. O Worker:
- valida a data;
- verifica no GitHub se já existe uma execução na fila ou em curso;
- só então solicita o workflow `Recolha diária Flashscore + Bwin` para a branch `main`;
- nunca envia o token GitHub para o navegador.

O workflow mantém o seu grupo de concorrência, limite de 2.000 jogos e intervalo configurado de 1 segundo. Se o Flashscore responder 403 ou 429, o coletor interrompe a recolha.

**Importante:** não coloques nenhum dos secrets em ficheiros do repositório, no HTML, no JavaScript ou em mensagens públicas. Se a chave `CONTROL_TOKEN` for exposta, substitui-a imediatamente no Cloudflare.
