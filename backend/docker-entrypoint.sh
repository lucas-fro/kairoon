#!/bin/sh
# Cria o banco (se tiver permissão) e aplica migrations antes de subir a API.
# Faz retry porque o Postgres vive em OUTRO compose (rede "web") e pode ainda
# não estar aceitando conexões no momento em que este container inicia.

n=0
until { npm run db:create || true; } && npm run db:migrate; do
  n=$((n + 1))
  if [ "$n" -ge 30 ]; then
    echo "Postgres não respondeu / migrations falharam após 30 tentativas. Abortando."
    exit 1
  fi
  echo "Banco indisponível ainda; tentativa $n/30, aguardando 2s..."
  sleep 2
done

echo "Migrations aplicadas. Iniciando a API..."
exec npm run start
