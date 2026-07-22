using FastEndpoints;

namespace Example.Api.Endpoints.Auth;

public class LoginEndpoint : Endpoint<LoginCommand, TokenResponse>
{
    public override void Configure()
    {
        Post("/auth/login");
        AllowAnonymous();
    }

    public override async Task HandleAsync(LoginCommand req, CancellationToken ct)
    {
        await Send.OkAsync(cancellation: ct);
    }
}

public record LoginCommand(string Email, string Password);
public record TokenResponse(string Token);
