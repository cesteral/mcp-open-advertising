import "reflect-metadata";
import { container } from "tsyringe";
import { DeliveryService, EntityService } from "@bidshifter/platform-lib";
import { createLogger } from "@bidshifter/shared";

/**
 * Configure dependency injection container
 */
export function setupContainer() {
  // Register logger
  const logger = createLogger("dbm-mcp");
  container.register("Logger", { useValue: logger });

  // Register services
  container.register(DeliveryService, { useClass: DeliveryService });
  container.register(EntityService, { useClass: EntityService });

  return container;
}

export { container };
