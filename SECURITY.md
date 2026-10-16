# Política de Segurança do Taiada Fiscaliza ("Cobra, Taiada!")

A plataforma **Taiada Fiscaliza** é um projeto de código aberto voltado à governança colaborativa e fiscalização de serviços públicos no município de **Caçapava - SP** (Código IBGE: `3508504`). A segurança dos dados dos munícipes, a integridade das informações públicas e a resiliência contra spam e ataques são prioridades absolutas.

---

## 1. Relato de Vulnerabilidades

Se você identificar qualquer vulnerabilidade de segurança, falha de isolamento de dados ou potencial vetor de abuso na plataforma, solicitamos que entre em contato de maneira responsável antes de qualquer divulgação pública:

- **Canal de Segurança:** Abra uma issue privada ou contate a equipe de mantenedores via e-mail (`seguranca@taiadafiscaliza.cacapava.br` ou via canal privado dos mantenedores no repositório).
- **Tempo de Resposta:** Nos comprometemos a acusar recebimento em até 48 horas e emitir um parecer ou plano de remediação em até 7 dias úteis.

---

## 2. Pilares de Segurança Implementados no Sistema

### 2.1. Arquitetura Zero-Auth e Anonimização LGPD
- A plataforma não exige criação de conta com login/senha nem coleta e-mails ou números de telefone dos munícipes.
- Cada dispositivo recebe um cookie assinado criptograficamente `taiada_device_token` via **HMAC-SHA256** utilizando `DEVICE_SECRET`.
- No banco de dados, armazena-se exclusivamente o `device_hash` gerado por:
  $$\text{device\_hash} = \text{SHA-256}(\text{device\_id} + \text{sub-rede IP})$$
- O endereço IP completo do cidadão **nunca** é registrado em tabelas ou logs públicos.

### 2.2. Proteção contra Trolls e Fraudes Eleitorais / Comunitárias
1. **Trava de Teto Remoto:** Votos e apoios emitidos sem prova de presença GPS ou fora do raio de $150\text{ m}$ são limitados a um impacto máximo de $\pm 3,0$ pontos no saldo do problema, impossibilitando que grupos organizados à distância encerrem chamados comunitários.
2. **Prova de Presença GPS ($\le 150\text{ m}$):** O status `resolved_community` exige pontuação ponderada $S \ge 10,0$ e a validação presencial de no mínimo 2 dispositivos distintos dentro do raio de 150 metros.
3. **Expurgo em 1 Clique (72h):** Caso um dispositivo realize condutas lesivas ou envie dados falsificados, o administrador pode disparar `POST /api/admin/purge-device`, que em uma única transação atômica ACID no SQLite remove todos os relatos, votos e fotos do infrator nas últimas 72 horas e recalcula instantaneamente os saldos da cidade.
4. **Shadowban:** Dispositivos banidos continuam recebendo respostas de sucesso (HTTP 200/201), mas suas submissões recebem `is_shadowbanned = 1` e são isoladas dos dados visíveis pela população.

### 2.3. Sanitização Rigorosa de Imagens (LGPD)
- Todas as fotos enviadas passam por processamento via `sharp` e `multer.memoryStorage()`.
- Metadados de número de série da câmera, modelo de smartphone e dados de privacidade são **100% removidos** do arquivo público convertido para `.webp` (qualidade 80).
- Metadados de auditoria (coordenadas e data do EXIF) são gravados em campos protegidos do banco apenas para validação do selo cívico *"Foto verificada no local"*.

### 2.4. Autenticação Administrativa com Tempo Constante
- A rota `/admin` e os endpoints de moderação utilizam comparação de strings em tempo constante (`crypto.timingSafeEqual`) contra o `ADMIN_TOKEN`, mitigando ataques de temporização (*timing attacks*).

### 2.5. Zero Segredos no Repositório
- Nenhuma chave secreta, token administrativo ou senha é registrada no código-fonte.
- As variáveis são validadas na inicialização do servidor via esquema Zod (`src/config/env.ts`).
