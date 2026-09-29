package org.keycloak.services.resources.admin;

import jakarta.ws.rs.Path;

public class RealmAdminResource {
    @Path("users")
    public UsersResource users() {
        return new UsersResource();
    }
}
