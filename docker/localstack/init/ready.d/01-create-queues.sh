#!/bin/bash
# Bootstrap das filas SQS no LocalStack (roda automaticamente quando o LocalStack fica "ready").
# Topologia inicial da saga Game <-> Wallet (nomes podem ser refinados na Etapa 5):
#   - wallet-inbox  (+ DLQ): comandos Game -> Wallet  (DebitFunds, CreditFunds)
#   - game-inbox    (+ DLQ): resultados Wallet -> Game (FundsDebited, FundsDebitRejected, FundsCredited)
# Cada fila principal aponta para sua DLQ via redrive policy (maxReceiveCount=5).
set -euo pipefail

MAX_RECEIVE_COUNT=5

create_queue_with_dlq() {
  local name="$1"
  local dlq="${name}-dlq"

  awslocal sqs create-queue --queue-name "$dlq" >/dev/null

  local dlq_arn
  dlq_arn=$(awslocal sqs get-queue-attributes \
    --queue-url "http://localhost:4566/000000000000/${dlq}" \
    --attribute-names QueueArn \
    --query 'Attributes.QueueArn' --output text)

  awslocal sqs create-queue \
    --queue-name "$name" \
    --attributes "{\"RedrivePolicy\":\"{\\\"deadLetterTargetArn\\\":\\\"${dlq_arn}\\\",\\\"maxReceiveCount\\\":\\\"${MAX_RECEIVE_COUNT}\\\"}\"}" >/dev/null

  echo "  created queue '${name}' (+ DLQ '${dlq}')"
}

echo "[init] creating SQS queues..."
create_queue_with_dlq "wallet-inbox"
create_queue_with_dlq "game-inbox"
echo "[init] SQS queues ready:"
awslocal sqs list-queues
