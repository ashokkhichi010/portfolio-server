import { IsString } from 'class-validator';

export class AdminLogoutDto {
  @IsString()
  refreshToken: string;
}
