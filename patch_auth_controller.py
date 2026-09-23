with open('backend/api-server/src/controllers/authController.ts', 'r') as f:
    content = f.read()

old_code = """    const hash = await bcrypt.hash(new_password, 10);
    await prisma.user.update({ where: { id: userId }, data: { password_hash: hash } });

    return res.json({ success: true, data: { message: 'Password updated' } });"""

new_code = """    const hash = await bcrypt.hash(new_password, 10);
    await prisma.user.update({ where: { id: userId }, data: { password_hash: hash } });

    await prisma.auditLog.create({
      data: {
        userId: user.id,
        action: 'PASSWORD_CHANGED',
        entityType: 'User',
        entityId: user.id,
        metadata: { message: `User ${user.username} changed their password via mobile app` }
      }
    });

    return res.json({ success: true, data: { message: 'Password updated' } });"""

content = content.replace(old_code, new_code)

with open('backend/api-server/src/controllers/authController.ts', 'w') as f:
    f.write(content)
