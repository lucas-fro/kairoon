# Kairoon — Landing Page

Landing page estática de alta conversão, seguindo o Design System v1.0
(`frontend/DESIGN.md` / `frontend/tailwind.config.ts`).

## Stack

HTML + CSS + JS puro, sem build e sem dependências. Os tokens do Tailwind do
app foram espelhados como variáveis CSS em `styles.css` — se um token mudar no
`tailwind.config.ts`, atualize o `:root` correspondente aqui.

## Como visualizar

Abra `index.html` direto no navegador, ou sirva a pasta:

```
npx serve LP
```

## Antes de publicar

1. **Imagens**: todos os blocos cinza (`.ph`) são placeholders com a descrição
   da imagem que deve entrar ali — prints reais do sistema e fotos editoriais.
   Substitua por `<img>` mantendo o mesmo container.
2. **Preços dos planos**: os valores dos planos Pro (R$ 49), Max (R$ 99) e
   Enterprise (Personalizado) na seção Planos são ilustrativos. Ajuste para os
   valores reais antes de publicar.
3. **Links de CTA**: os botões "Começar grátis" / "Entrar" apontam para `#` ou
   âncoras internas. Troque pelos URLs reais de cadastro e login do app.
4. **Contato e redes**: e-mail do footer (`contato@kairoon.com.br`), Instagram
   e WhatsApp são placeholders.
5. **Legal**: Política de privacidade e Termos de uso apontam para `#`.
