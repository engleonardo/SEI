# SEI Flow 1.5.0 - novidades

- **Novo gatilho “Ao criar o cartão”**: aplica a regra na hora em que o cartão é criado pela extensão.
- **Datas nas regras**: defina data de início e de término (hoje, em N dias ou há N dias) ao criar, mover, concluir ou quando o processo do SEI for atualizado.
- **Comentários automáticos**: adicione um comentário com texto fixo e marcadores como `{processo}`, `{data}`, `{hora}`, `{lista}` e `{quadro}`.
- **Conclusão e reabertura**: marque ou reabra o cartão como parte da regra.
- **Desfazer completo**: a última aplicação manual agora reverte datas e conclusão e remove os comentários criados.
- **Aplicar agora** ignora cartões que já estão com a data ou a conclusão definida.
- Seis modelos de regra iniciais para novas instalações.
- **Chrome**: correção/documentação do erro `_metadata` ao carregar a extensão sem compactação. Use o zip da release em uma pasta nova ou `npm run unpacked`.
- Dados de exemplo e capturas de tela atualizados com números de processo fictícios.
