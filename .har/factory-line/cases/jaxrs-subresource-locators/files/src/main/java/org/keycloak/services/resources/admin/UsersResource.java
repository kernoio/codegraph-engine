package org.keycloak.services.resources.admin;

import jakarta.ws.rs.GET;
import jakarta.ws.rs.POST;
import jakarta.ws.rs.Path;
import jakarta.ws.rs.core.Response;

public class UsersResource {
    @POST
    public Response createUser() {
        return null;
    }

    @GET
    public Response getUsers() {
        return null;
    }

    @Path("{user-id}")
    public UserResource user() {
        return new UserResource();
    }

    @Path("count")
    @GET
    public Response count() {
        return null;
    }
}
