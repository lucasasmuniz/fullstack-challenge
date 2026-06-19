import { Module, type DynamicModule } from "@nestjs/common";
import { APP_GUARD } from "@nestjs/core";
import { JwksGuard } from "./jwks.guard";
import { JWT_VERIFIER } from "./jwt-verifier";
import { JoseJwtVerifier, type JwksVerifierOptions } from "./jose-jwt-verifier";

export type AuthModuleOptions = JwksVerifierOptions;

@Module({})
export class AuthModule {
  static forRoot(options: AuthModuleOptions): DynamicModule {
    return {
      module: AuthModule,
      global: true,
      providers: [
        {
          provide: JWT_VERIFIER,
          useFactory: (): JoseJwtVerifier =>
            JoseJwtVerifier.fromJwksUri(options),
        },
        JwksGuard,
        { provide: APP_GUARD, useExisting: JwksGuard },
      ],
      exports: [JWT_VERIFIER],
    };
  }
}
