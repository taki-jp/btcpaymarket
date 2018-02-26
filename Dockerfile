FROM php:7.0-apache
MAINTAINER cryptcoin.junkey@gmail.com

RUN a2enmod rewrite

COPY . /var/www/html/

