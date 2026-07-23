package io.vertx.example.web.rest;

import io.vertx.core.AbstractVerticle;
import io.vertx.ext.web.Router;
import io.vertx.ext.web.RoutingContext;
import io.vertx.ext.web.handler.BodyHandler;

/**
 * Trimmed from vert-x3/vertx-examples web-examples/.../rest/SimpleREST.java
 */
public class SimpleREST extends AbstractVerticle {
  @Override
  public void start() {
    Router router = Router.router(vertx);
    router.route().handler(BodyHandler.create());
    router.get("/products/:productID").handler(this::handleGetProduct);
    router.put("/products/:productID").handler(this::handleAddProduct);
    router.get("/products").handler(this::handleListProducts);
    vertx.createHttpServer().requestHandler(router).listen(8080);
  }

  private void handleGetProduct(RoutingContext routingContext) {}

  private void handleAddProduct(RoutingContext routingContext) {}

  private void handleListProducts(RoutingContext routingContext) {}
}
