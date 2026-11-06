import { BadRequestException, ConflictException, Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { JwtService } from '@nestjs/jwt';
import { Repository } from 'typeorm';
import * as bcrypt from 'bcrypt';
import { RoleType } from '../../common/enums';
import { User } from '../users/entities/user.entity';
import { Role } from '../users/entities/role.entity';
import { LoginDto, RegisterDto } from './dto/auth.dto';
import { JwtPayload } from './jwt.strategy';

const PG_UNIQUE_VIOLATION = '23505';

export interface PublicUser {
  id: string;
  email: string;
  role: RoleType;
}

@Injectable()
export class AuthService {
  private readonly saltRounds: number;
  private readonly dummyHash: string;

  constructor(
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
    @InjectRepository(Role)
    private readonly roleRepository: Repository<Role>,
    private readonly jwtService: JwtService,
    configService: ConfigService,
  ) {
    this.saltRounds = configService.get<number>('auth.saltRounds', 10);
    this.dummyHash = bcrypt.hashSync('dummy-password-for-timing', this.saltRounds);
  }

  async login(dto: LoginDto): Promise<{ accessToken: string; user: PublicUser }> {
    const user = await this.userRepository.findOne({
      where: { email: dto.email.toLowerCase() },
      select: { id: true, email: true, password_hash: true, role_id: true },
      relations: { role: true },
    });

    const passwordOk = await bcrypt.compare(dto.password, user?.password_hash ?? this.dummyHash);
    if (!user || !passwordOk) {
      throw new UnauthorizedException('Invalid credentials');
    }

    const publicUser = this.toPublicUser(user);
    const payload: JwtPayload = { sub: publicUser.id, email: publicUser.email, role: publicUser.role };
    return { accessToken: await this.jwtService.signAsync(payload), user: publicUser };
  }

  async register(dto: RegisterDto): Promise<PublicUser> {
    const role = await this.roleRepository.findOne({ where: { name: dto.role } });
    if (!role) {
      throw new BadRequestException(`Role ${dto.role} is not configured`);
    }

    const user = this.userRepository.create({
      email: dto.email.toLowerCase(),
      password_hash: await bcrypt.hash(dto.password, this.saltRounds),
      role_id: role.id,
    });

    try {
      const saved = await this.userRepository.save(user);
      return this.toPublicUser({ ...saved, role });
    } catch (err) {
      if ((err as { code?: string }).code === PG_UNIQUE_VIOLATION) {
        throw new ConflictException('Email already registered');
      }
      throw err;
    }
  }

  toPublicUser(user: User): PublicUser {
    return { id: user.id, email: user.email, role: user.role.name as RoleType };
  }
}
