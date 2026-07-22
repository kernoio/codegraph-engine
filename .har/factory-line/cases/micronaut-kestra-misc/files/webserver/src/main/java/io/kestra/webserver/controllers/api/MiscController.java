package io.kestra.webserver.controllers.api;

import io.micronaut.http.annotation.Controller;
import io.micronaut.http.annotation.Get;
import io.micronaut.http.annotation.Post;

@Controller("/api/v1")
public class MiscController {
    @Get("/configs")
    public Object getConfiguration() {
        return null;
    }

    @Get("/configs/login")
    public Object getLoginConfiguration() {
        return null;
    }

    @Get("/{tenant}/usages/all")
    public Object getUsages() {
        return null;
    }

    @Post(uri = "/{tenant}/basicAuth")
    public Object createBasicAuth() {
        return null;
    }

    @Post("/login")
    public Object login() {
        return null;
    }
}
