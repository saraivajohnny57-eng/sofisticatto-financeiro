# Testes de regressão isolados

Execute `node --test tests/security-regression.test.js` em Node.js 22.

A suíte é estática e não acessa SEFAZ, Supabase, bancos ou transportadoras. Ela deve falhar quando a branch contém as vulnerabilidades conhecidas; isso é intencional. Não confundir resultado desta suíte com sincronização real.
