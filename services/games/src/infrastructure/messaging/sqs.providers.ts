import type { Provider } from "@nestjs/common";
import { AwsSqsClient } from "@crash-game/messaging";
import { ENV } from "@crash-game/nestjs-kit";
import type { GamesEnv } from "../config/env.schema";

/** Token DI do `SqsClient` (port do `@crash-game/messaging`). */
export const SQS_CLIENT = Symbol("SQS_CLIENT");

/** Cria o `AwsSqsClient` a partir da env (endpoint do LocalStack em dev). */
export const sqsClientProvider: Provider = {
  provide: SQS_CLIENT,
  inject: [ENV],
  useFactory: (env: GamesEnv): AwsSqsClient =>
    new AwsSqsClient({
      region: env.AWS_REGION,
      endpoint: env.AWS_ENDPOINT,
      accessKeyId: env.AWS_ACCESS_KEY_ID,
      secretAccessKey: env.AWS_SECRET_ACCESS_KEY,
    }),
};
