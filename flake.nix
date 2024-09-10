{
  inputs.pkgs.url = "github:NixOS/nixpkgs/";

  outputs =
    { pkgs, ... }:
    let
      nixpkgs = import pkgs { system = "x86_64-linux"; };
    in
    {
      devShells.x86_64-linux.default = nixpkgs.mkShell {
        packages = [
          nixpkgs.pkgs.nodejs_22
        ];
      };
    };
}
