from rest_framework import serializers
from django.contrib.auth.models import User
from .models import Conversation, Message, Document


def build_recent_exchange(conversation: Conversation):
    """Return the most recent user query and its assistant reply with timestamps."""
    last_assistant = conversation.messages.filter(role='assistant').order_by('-created_at').first()
    last_user = None

    if last_assistant:
        # Pair the latest assistant reply with the closest preceding user query.
        last_user = conversation.messages.filter(
            role='user',
            created_at__lte=last_assistant.created_at
        ).order_by('-created_at').first()
    else:
        last_user = conversation.messages.filter(role='user').order_by('-created_at').first()

    if not last_user and not last_assistant:
        return None

    return {
        'query': last_user.content if last_user else None,
        'query_time': last_user.created_at.isoformat() if last_user else None,
        'answer': last_assistant.content if last_assistant else None,
        'answer_time': last_assistant.created_at.isoformat() if last_assistant else None,
    }

class UserSerializer(serializers.ModelSerializer):
    """
    Serializer for user registration.
    We use write_only for password so it's never returned in API responses.
    """
    password = serializers.CharField(write_only=True, min_length=8)

    class Meta:
        model = User
        fields = ['id', 'username', 'email', 'password']

    def create(self, validated_data):
        # Use create_user to properly hash passwords
        user = User.objects.create_user(
            username=validated_data['username'],
            email=validated_data.get('email', ''),
            password=validated_data['password']
        )
        return user


class MessageSerializer(serializers.ModelSerializer):
    """
    Serializer for individual messages.
    Simple pass-through of model fields.
    """
    class Meta:
        model = Message
        fields = ['id', 'role', 'content', 'created_at']
        read_only_fields = ['id', 'created_at']


class ConversationSerializer(serializers.ModelSerializer):
    """
    Serializer for conversations.
    Includes nested messages and message count.
    """
    messages = MessageSerializer(many=True, read_only=True)
    message_count = serializers.SerializerMethodField()
    recent_exchange = serializers.SerializerMethodField()

    class Meta:
        model = Conversation
        fields = ['id', 'title', 'created_at', 'updated_at', 'messages', 'message_count', 'recent_exchange']
        read_only_fields = ['id', 'created_at', 'updated_at']

    def get_message_count(self, obj):
        return obj.messages.count()

    def get_recent_exchange(self, obj):
        return build_recent_exchange(obj)


class ConversationListSerializer(serializers.ModelSerializer):
    """
    Lightweight serializer for listing conversations in sidebar.
    We don't include full messages here for performance.
    """
    message_count = serializers.SerializerMethodField()
    last_message = serializers.SerializerMethodField()
    chat_started_at = serializers.SerializerMethodField()
    last_interacted_at = serializers.SerializerMethodField()
    recent_exchange = serializers.SerializerMethodField()

    class Meta:
        model = Conversation
        fields = [
            'id',
            'title',
            'created_at',
            'updated_at',
            'chat_started_at',
            'last_interacted_at',
            'message_count',
            'last_message',
            'recent_exchange'
        ]

    def get_message_count(self, obj):
        return obj.messages.count()

    def get_last_message(self, obj):
        last_msg = obj.messages.last()
        if last_msg:
            return {
                'role': last_msg.role,
                'content': last_msg.content[:50] + '...' if len(last_msg.content) > 50 else last_msg.content
            }
        return None

    def get_chat_started_at(self, obj):
        return obj.created_at.strftime('%Y-%m-%d %H:%M') if obj.created_at else None

    def get_last_interacted_at(self, obj):
        return obj.updated_at.strftime('%Y-%m-%d %H:%M') if obj.updated_at else None

    def get_recent_exchange(self, obj):
        return build_recent_exchange(obj)



class DocumentSerializer(serializers.ModelSerializer):
    """
    Serializer for uploaded PDF documents.
    """
    file_url = serializers.SerializerMethodField()
    
    class Meta:
        model = Document
        fields = [
            'id', 'filename', 'status', 'num_pages', 'num_chunks',
            'error_message', 'created_at', 'processed_at', 'file_url'
        ]
        read_only_fields = [
            'id', 'status', 'num_pages', 'num_chunks', 
            'error_message', 'created_at', 'processed_at'
        ]
    
    def get_file_url(self, obj):
        request = self.context.get('request')
        if obj.file and request:
            return request.build_absolute_uri(obj.file.url)
        return None