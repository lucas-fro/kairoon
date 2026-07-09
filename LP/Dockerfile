# Landing page estática da Kairoon servida por nginx
FROM nginx:1.27-alpine

# Config customizada (gzip, cache, charset UTF-8)
COPY default.conf /etc/nginx/conf.d/default.conf

# Arquivos da LP
COPY index.html styles.css script.js /usr/share/nginx/html/
COPY elementos/ /usr/share/nginx/html/elementos/

EXPOSE 80
